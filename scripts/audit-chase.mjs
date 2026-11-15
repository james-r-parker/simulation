// The chase envelope (`npm run audit:chase`): the body table, then the catch grid, fair band and energy per kill of every
// hunting specialisation against every specialisation (docs/designs/senses-and-motor.md, Phase 2). Logs every cell at
// debug level to `.sim/logs/audit-chase-<seed>.jsonl`.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyTable } from '../js/evo/chase-body.js';
import { DISTANCE_SHARES, runEnvelope, TRIALS } from '../js/evo/chase-envelope.js';
import { arenaConfig } from '../js/evo/chase-arena.js';
import { configHash } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { formatBodies, formatPair } from './lib/chase-report.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { logRunConfig } from './lib/run-config.mjs';

const USAGE =
    'usage: audit-chase [--pairs hunter:prey,...] [--trials <n>] [--seed <n>] [--no-sprint] [--straight] [--config <file.json>] [--json] [--out <path>]';

/**
 * @typedef {object} ChaseArgs
 * @property {[string, string][] | undefined} pairs the named pairs (default every hunter against every specialisation)
 * @property {number} trials trials per cell
 * @property {number} seed the base seed
 * @property {boolean} noSprint whether neither body sprints
 * @property {boolean} straight whether the evader never breaks (a bound: the best the pursuer can do)
 * @property {string | null} config a config overrides file
 * @property {boolean} json whether to print JSON
 * @property {string | null} out a file to write the output to
 */

/**
 * @param {string | undefined} value `hunter:prey,hunter:prey`
 * @returns {[string, string][]} the pairs
 * @throws {Error} on an entry that is not `a:b`
 */
function parsePairs(value) {
    return String(value)
        .split(',')
        .map((entry) => {
            const [pursuer, evader, ...extra] = entry.split(':');
            if (!pursuer || !evader || extra.length > 0) {
                throw new Error(`--pairs: "${entry}" is not hunter:prey\n${USAGE}`);
            }
            return [pursuer, evader];
        });
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ChaseArgs} parsed options
 */
export function parseArgs(argv) {
    return /** @type {ChaseArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--pairs': (v) => ['pairs', parsePairs(v)],
                '--trials': (v, f) => ['trials', intValue(f, v, 1, USAGE)],
                '--seed': (v, f) => ['seed', intValue(f, v, 0, USAGE)],
                '--config': (v) => ['config', String(v)],
                '--out': (v) => ['out', String(v)],
            },
            booleanFlags: { '--json': 'json', '--straight': 'straight', '--no-sprint': 'noSprint' },
            defaults: {
                pairs: undefined,
                trials: TRIALS,
                seed: 1,
                noSprint: false,
                straight: false,
                config: null,
                json: false,
                out: null,
            },
            usage: USAGE,
        })
    );
}

/**
 * @param {ChaseArgs} args the options
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the table prints
 * @returns {Promise<ReturnType<typeof runEnvelope>>} the results
 */
export async function runChase(args, { logDir = '.sim/logs', print = console.log } = {}) {
    const overrides = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    const config = arenaConfig({ ...overrides, seed: args.seed });
    const path = join(logDir, `audit-chase-${args.seed}.jsonl`);
    rmSync(path, { force: true });
    const file = createJsonlSink(path);
    try {
        const log = createSimLog(file.sink, { level: 'debug' });
        logRunConfig(log, {
            tool: 'audit-chase',
            policy: null,
            configHash: configHash(config),
            seeds: [args.seed],
            ticks: null,
        });
        const results = runEnvelope(config, { ...args, sprint: !args.noSprint });
        for (const pair of results) {
            pair.grid.forEach((row, d) =>
                row.forEach((cell, b) =>
                    log.log('debug', 'ChaseEnvelopeCell', {
                        pursuer: pair.pursuer,
                        evader: pair.evader,
                        distanceShare: DISTANCE_SHARES[d],
                        bearing: b,
                        catches: cell.caught,
                        trials: cell.trials,
                    }),
                ),
            );
        }
        const text = args.json
            ? JSON.stringify({ bodies: bodyTable(config), pairs: results }, null, 2)
            : [formatBodies(bodyTable(config)), ...results.map(formatPair)].join('\n\n');
        print(text);
        if (args.out !== null) {
            writeFileSync(args.out, `${text}\n`);
        }
        return results;
    } finally {
        await file.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the table prints
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}) {
    const code = await exitCodeOf(() => runChase(parseArgs(argv), io));
    return code;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
