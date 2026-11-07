// Reflex cases: scores genomes on the brain-only input sequences and prints each one's pass share and edge per case, its
// score, and the bars of every case (`npm run reflex`). Logs `ReflexResult` at info level, and with `--level debug` each
// failed trial (`ReflexCase`), to `.sim/logs/reflex-<seed>x<trials>.jsonl`. See docs/designs/brain-reflex-tests.md.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeArchive } from '../js/evo/archive-codec.js';
import { REFLEX_CASES } from '../js/evo/reflex-cases.js';
import { reflexRow } from '../js/evo/reflex-score.js';
import { REFLEX_TRIALS } from '../js/evo/reflex-stage.js';
import { createConfig } from '../js/sim/config.js';
import { LOG_LEVEL, createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { eliteSubjects, fileSubject } from './lib/drill-subjects.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { formatReport, reportJson } from './lib/reflex-report.mjs';
import { runPool } from './lib/worker-pool.mjs';
import { loadChampions } from './memory-probe.mjs';

const WORKER_URL = new URL('./reflex-worker.mjs', import.meta.url);
const EVAL_WORKER_URL = new URL('./eval-worker.mjs', import.meta.url);
/** Ticks of the fresh world `--policy` takes the archive of. */
export const POLICY_TICKS = 20000;
const NAMES = REFLEX_CASES.map((c) => c.name);
const USAGE =
    'usage: reflex (--champions <dir> | --archive <file> | --policy <name>) [--count <n>] [--cases <a,b>] [--seed <n>] [--trials <n>] [--config <file.json>] [--level <name>] [--json] [--out <path>] [--workers <n>]';

/**
 * @typedef {object} ReflexArgs
 * @property {string | null} champions a directory of champion files
 * @property {string | null} archive an archive file (`archive-<g>.json`)
 * @property {string | null} policy a registered policy to run for `POLICY_TICKS` and take the best archive elites of
 * @property {number} count elites taken with `--policy`
 * @property {string[]} cases the cases to run (default all)
 * @property {number} seed the case seed
 * @property {number} trials trials per case
 * @property {string | null} config a config overrides file
 * @property {string} level the log level (`debug` adds a record per failed trial)
 * @property {boolean} json whether to print JSON
 * @property {string | null} out a file to write the output to
 * @property {number | undefined} workers pool size
 */

/**
 * @param {string | undefined} value a comma-separated list of case names
 * @returns {string[]} the names
 * @throws {Error} on an unknown name, listing the known ones
 */
function parseCases(value) {
    const names = String(value).split(',');
    const unknown = names.filter((name) => !NAMES.includes(name));
    if (unknown.length > 0) {
        throw new Error(`--cases: unknown case "${unknown[0]}"; known: ${NAMES.join(', ')}\n${USAGE}`);
    }
    return names;
}

/**
 * @param {string | undefined} value a log level name
 * @returns {string} the level
 * @throws {Error} on an unknown level
 */
function parseLevel(value) {
    if (value === undefined || !Object.hasOwn(LOG_LEVEL, value)) {
        throw new Error(`--level: expected one of ${Object.keys(LOG_LEVEL).join(', ')}, got ${value}\n${USAGE}`);
    }
    return value;
}

/** The flags that name where the genomes come from; exactly one is given. */
const SOURCE_KINDS = Object.freeze(['champions', 'archive', 'policy']);

/**
 * @param {string} key the option the flag sets
 * @param {(value: string | undefined) => any} parse reads the flag's value
 * @returns {(value: string | undefined) => [string, any]} a parser for the flag
 */
const flagOf = (key, parse) => (value) => [key, parse(value)];

/**
 * @param {string} key the option the flag sets
 * @returns {(value: string | undefined) => [string, any]} a parser for a text flag
 */
const textFlag = (key) => flagOf(key, String);

/**
 * @param {string} key the option the flag sets
 * @param {number} min the smallest allowed value
 * @returns {(value: string | undefined, flag: string) => [string, any]} a parser for an integer flag
 */
const intFlag = (key, min) => (value, flag) => [key, intValue(flag, value, min, USAGE)];

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ReflexArgs} parsed options
 * @throws {Error} unless exactly one of `--champions`, `--archive` and `--policy` is given
 */
export function parseArgs(argv) {
    const valueFlags = {
        ...Object.fromEntries(SOURCE_KINDS.map((kind) => [`--${kind}`, textFlag(kind)])),
        '--count': intFlag('count', 1),
        '--cases': flagOf('cases', parseCases),
        '--seed': intFlag('seed', 0),
        '--trials': intFlag('trials', 1),
        '--config': textFlag('config'),
        '--level': flagOf('level', parseLevel),
        '--out': textFlag('out'),
        '--workers': intFlag('workers', 1),
    };
    const defaults = {
        ...Object.fromEntries(SOURCE_KINDS.map((kind) => [kind, null])),
        count: 8,
        cases: NAMES,
        seed: 1,
        trials: REFLEX_TRIALS,
        config: null,
        level: 'info',
        json: false,
        out: null,
        workers: undefined,
    };
    const args = /** @type {ReflexArgs} */ (
        parseFlags(argv, { valueFlags, booleanFlags: { '--json': 'json' }, defaults, usage: USAGE })
    );
    if (SOURCE_KINDS.filter((kind) => /** @type {Record<string, any>} */ (args)[kind] !== null).length !== 1) {
        throw new Error(`give exactly one of --champions, --archive and --policy\n${USAGE}`);
    }
    return args;
}

/**
 * @param {ReflexArgs} args the options
 * @param {{config: Record<string, any>, log: import('../js/sim/log.js').SimLog}} run the config overrides and the log
 * @returns {Promise<import('../js/evo/memory-probe-run.js').Subject[]>} the genomes to score: a directory of champion
 *   files, the best elite of each specialisation in an archive file, or the best elites of a policy run
 */
async function genomesOf(args, run) {
    const { config, log } = run;
    const base = createConfig(config);
    if (args.champions !== null) {
        return loadChampions(args.champions, run);
    }
    if (args.archive !== null) {
        return eliteSubjects(decodeArchive(JSON.parse(readFileSync(args.archive, 'utf8')), base, log));
    }
    const eval1 = { seed: args.seed, ticks: POLICY_TICKS, policy: String(args.policy), overrides: config };
    const [{ champions }] = await runPool([{ ...eval1, saveChampions: args.count }], {
        workerUrl: EVAL_WORKER_URL,
        workers: 1,
    });
    return champions.map((/** @type {Record<string, any>} */ file) => fileSubject(file, base));
}

/**
 * Scores the genomes: one pool task per case, each building its table once.
 * @param {ReflexArgs} args the options (`cases`, `seed`, `trials`, `level`, `workers`; the source flags are not read)
 * @param {{genomes: import('../js/evo/memory-probe-run.js').Subject[], config: Record<string, any>, log: import('../js/sim/log.js').SimLog}} run
 *   the genomes, the config overrides and the log
 * @returns {Promise<{rows: import('./lib/reflex-report.mjs').ReflexReportRow[], bars: Record<string, import('../js/evo/reflex-score.js').CaseBars>}>}
 *   a row per genome, in order, and the bars of each case
 */
export async function scoreGenomes(args, { genomes, config, log }) {
    const chosen = REFLEX_CASES.filter((c) => args.cases.includes(c.name));
    const owners = chosen.map((c) => genomes.flatMap((g, i) => (g.spec === c.spec ? [i] : [])));
    const tasks = chosen.map((c, k) => ({
        case: c.name,
        subjects: owners[k].map((i) => ({ name: genomes[i].name, id: genomes[i].id, weights: genomes[i].weights })),
        seed: args.seed,
        trials: args.trials,
        config,
        debug: args.level === 'debug',
    }));
    const results = await runPool(tasks, { workerUrl: WORKER_URL, workers: args.workers });
    for (const record of results.flatMap((r) => r.records)) {
        log.log('debug', 'ReflexCase', record);
    }
    const bars = Object.fromEntries(chosen.map((c, i) => [c.name, results[i].bars]));
    const rows = genomes.map((genome, g) => {
        const scores = Object.fromEntries(
            chosen.flatMap((c, k) =>
                owners[k].includes(g) ? [[c.name, results[k].scores[owners[k].indexOf(g)]]] : [],
            ),
        );
        const row = reflexRow(scores, bars);
        for (const [name, cell] of Object.entries(row?.cases ?? {})) {
            log.log('info', 'ReflexResult', { case: name, genomeId: genome.id, subject: genome.name, ...cell });
        }
        return { label: genome.name, row };
    });
    return { rows, bars };
}

/**
 * @param {ReflexArgs} args the options
 * @param {{logDir?: string, print?: (line: string) => void}} [io] where the log goes, and the output
 * @returns {Promise<{rows: import('./lib/reflex-report.mjs').ReflexReportRow[], bars: Record<string, import('../js/evo/reflex-score.js').CaseBars>}>}
 *   the rows and the bars
 */
export async function runReflex(args, { logDir = '.sim/logs', print = () => {} } = {}) {
    const path = join(logDir, `reflex-${args.seed}x${args.trials}.jsonl`);
    rmSync(path, { force: true });
    const sinkFile = createJsonlSink(path);
    try {
        const log = createSimLog(sinkFile.sink, { level: /** @type {any} */ (args.level) });
        const config = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
        const genomes = await genomesOf(args, { config, log });
        const result = await scoreGenomes(args, { genomes, config, log });
        const text = args.json
            ? JSON.stringify(reportJson(args.cases, result), null, 2)
            : formatReport(args.cases, result);
        print(text);
        if (args.out !== null) {
            writeFileSync(args.out, `${text}\n`);
        }
        return result;
    } finally {
        await sinkFile.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string}} [io] where the log goes
 * @returns {Promise<number>} the process exit code
 */
export function main(argv, io = {}) {
    return exitCodeOf(() => runReflex(parseArgs(argv), { ...io, print: console.log }));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
