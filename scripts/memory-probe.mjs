// Memory probes: runs champion genomes and the two reference controllers through the staged scenarios and prints the
// scores per control (`npm run probe:memory`). Logs every trial at debug level to `.sim/logs/probe-<seed>x<trials>.jsonl`.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { validateChampion } from '../js/evo/league.js';
import { GROUP_SCENARIO, TRIALS, probeSubject } from '../js/evo/memory-probe.js';
import { REFERENCES, referenceSubject } from '../js/evo/memory-probe-references.js';
import { SCENARIOS } from '../js/evo/memory-probe-scenarios.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { describeSubject, setScores } from './lib/probe-report.mjs';

/** The only brain layout there is; a champion file names its sizes, not a layout. */
const LAYOUT_NAME = 'pooled-v2';
const KNOWN = [...SCENARIOS.map((s) => s.name), GROUP_SCENARIO];
const USAGE =
    'usage: probe:memory [--champions <dir>] [--scenarios <name,...>] [--seed <n>] [--trials <n>] [--config <file.json>] [--no-references]';

/**
 * @typedef {object} ProbeArgs
 * @property {string | null} champions a directory of champion files
 * @property {string[]} scenarios the scenarios to run (default all)
 * @property {number} seed the base seed
 * @property {number} trials trials per control
 * @property {string | null} config a config overrides file
 * @property {boolean} noReferences whether to leave out the two reference controllers
 */

/**
 * @param {string | undefined} value a comma-separated list of scenario names
 * @returns {string[]} the names
 * @throws {Error} on an unknown name, listing the known ones
 */
function parseScenarios(value) {
    const names = String(value).split(',');
    const bad = names.find((name) => !KNOWN.includes(name));
    if (bad !== undefined) {
        throw new Error(`--scenarios: unknown scenario "${bad}"; known: ${KNOWN.join(', ')}\n${USAGE}`);
    }
    return names;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ProbeArgs} parsed options
 */
export function parseArgs(argv) {
    return /** @type {ProbeArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--champions': (value) => ['champions', String(value)],
                '--scenarios': (value) => ['scenarios', parseScenarios(value)],
                '--seed': (value, flag) => ['seed', intValue(flag, value, 0, USAGE)],
                '--trials': (value, flag) => ['trials', intValue(flag, value, 1, USAGE)],
                '--config': (value) => ['config', String(value)],
            },
            booleanFlags: { '--no-references': 'noReferences' },
            defaults: { champions: null, scenarios: KNOWN, seed: 1, trials: TRIALS, config: null, noReferences: false },
            usage: USAGE,
        })
    );
}

/**
 * Reads and validates every champion file of a directory against the config.
 * @param {string} dir the directory of `.json` champion files
 * @param {{config: Record<string, any>, log: import('../js/sim/log.js').SimLog}} run the config overrides and the log
 * @returns {import('../js/evo/memory-probe-run.js').Subject[]} one subject per file, in file-name order
 * @throws {Error} when the directory has no champion files, or a file does not fit the layout (after logging
 *   `probe.layout` with the expected and actual layout name and hidden size)
 */
export function loadChampions(dir, { config, log }) {
    const base = createConfig(config);
    const layout = brainLayout(base);
    const names = readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .sort();
    if (names.length === 0) {
        throw new Error(`--champions: no .json champion files in ${dir}`);
    }
    return names.map((name) => {
        const file = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        try {
            const champion = validateChampion(file, base);
            return {
                name: champion.name,
                id: file.genomeId ?? 0,
                spec: champion.specialisation,
                weights: champion.weights,
                act: null,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith('champion.layout')) {
                log.log('error', 'probe.layout', {
                    file: name,
                    expected: { layout: LAYOUT_NAME, brainHidden: layout.hidden, inputCount: layout.inputCount },
                    actual: {
                        layout: file.layout?.name ?? null,
                        brainHidden: file.layout?.brainHidden,
                        inputCount: file.layout?.inputCount,
                    },
                });
            }
            throw new Error(`${name}: ${message}`, { cause: error });
        }
    });
}

/**
 * @param {ProbeArgs} args the options
 * @param {{logDir?: string, print?: (line: string) => void}} [io] where the log goes, and the output
 * @returns {Promise<Record<string, number>>} the champion set's scores (`setScores`; empty without champions)
 */
export async function runProbe(args, { logDir = '.sim/logs', print = () => {} } = {}) {
    const path = join(logDir, `probe-${args.seed}x${args.trials}.jsonl`);
    rmSync(path, { force: true });
    const jsonl = createJsonlSink(path);
    const log = createSimLog(jsonl.sink, { level: 'debug' });
    try {
        const config = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
        const champions = args.champions === null ? [] : loadChampions(args.champions, { config, log });
        const references = args.noReferences ? [] : REFERENCES.map((kind) => referenceSubject(kind));
        const options = { config, seed: args.seed, trials: args.trials, scenarios: args.scenarios, log };
        const probed = [...champions, ...references].map((subject) => {
            const result = probeSubject(subject, options);
            const kind = references.includes(subject) ? 'reference' : 'champion';
            print(describeSubject(`${kind} ${subject.name}`, result).join('\n'));
            return { subject, result };
        });
        const scores = setScores(probed.filter((p) => champions.includes(p.subject)).map((p) => p.result));
        for (const [name, value] of Object.entries(scores)) {
            print(`${name} ${value.toFixed(3)} (mean over ${champions.length} champions)`);
        }
        return scores;
    } finally {
        await jsonl.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string}} [io] where the log goes
 * @returns {Promise<number>} the process exit code: 1 when a champion does not fit the layout, or on any error
 */
export function main(argv, io = {}) {
    return exitCodeOf(() => runProbe(parseArgs(argv), { ...io, print: (line) => console.log(line) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
