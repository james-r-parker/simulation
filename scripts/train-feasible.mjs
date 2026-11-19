// The learnability check (`npm run train:feasible -- --curriculum <ladder.json>`; docs/designs/training-loop.md, Learnability
// check): for each gated stage, evolves random brains on each gate drill in the stage's config and says whether the gate's
// bar is reachable, before a ladder spends hours on it. Writes `feasible.json`; logs `FeasibleStage`. A detector, never fitness.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { checkLadder, formatFeasible, PROBE_DEFAULTS } from './lib/feasible-run.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const USAGE =
    'usage: train:feasible --curriculum <ladder.json> [--until <stage>] [--generations <n>] [--seeds <n>] [--population <n>] [--trials <n>] [--workers <n>] [--out <path>] [--log-dir <dir>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{curriculum: string, until: string | null, generations: number, seeds: number, population: number, trials: number,
 *   workers: number | undefined, out: string | null, logDir: string}} the options
 * @throws {Error} on an unknown argument or no `--curriculum`
 */
export function parseArgs(argv) {
    const opts = parseFlags(argv, {
        valueFlags: {
            '--curriculum': (v) => ['curriculum', String(v)],
            '--until': (v) => ['until', String(v)],
            '--generations': (v, f) => ['generations', intValue(f, v, 1, USAGE)],
            '--seeds': (v, f) => ['seeds', intValue(f, v, 1, USAGE)],
            '--population': (v, f) => ['population', intValue(f, v, 2, USAGE)],
            '--trials': (v, f) => ['trials', intValue(f, v, 1, USAGE)],
            '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
            '--out': (v) => ['out', String(v)],
            '--log-dir': (v) => ['logDir', String(v)],
        },
        defaults: {
            curriculum: null,
            until: null,
            ...PROBE_DEFAULTS,
            workers: undefined,
            out: null,
            logDir: '.sim/logs',
        },
        usage: USAGE,
    });
    if (opts.curriculum === null) {
        throw new Error(`--curriculum is required\n${USAGE}`);
    }
    return /** @type {any} */ (opts);
}

/**
 * @param {string} file a file path relative to the repository root
 * @returns {Record<string, any>} its JSON
 */
const readRoot = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

/**
 * @param {ReturnType<typeof parseArgs>} args the options
 * @returns {Promise<import('./lib/feasible-run.mjs').StageFeasible[]>} each gated stage's result
 */
export async function runFeasible(args) {
    const name = args.curriculum.replace(/^.*\//, '').replace(/\.json$/, '');
    const sink = createJsonlSink(join(args.logDir, `train-feasible-${name}.jsonl`));
    try {
        const log = createSimLog(sink.sink, { level: 'info' });
        const stages = await checkLadder(
            /** @type {any} */ (JSON.parse(readFileSync(resolve(args.curriculum), 'utf8'))),
            {
                ...args,
                readConfig: readRoot,
                log,
            },
        );
        if (args.out !== null) {
            mkdirSync(dirname(resolve(args.out)), { recursive: true });
            writeFileSync(
                args.out,
                `${JSON.stringify({ curriculum: args.curriculum, ...sizeOf(args), stages }, null, 2)}\n`,
            );
        }
        return stages;
    } finally {
        await sink.close();
    }
}

/**
 * @param {ReturnType<typeof parseArgs>} args the options
 * @returns {{generations: number, seeds: number, population: number, trials: number}} the probe's sizes
 */
const sizeOf = ({ generations, seeds, population, trials }) => ({ generations, seeds, population, trials });

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] receives each stage's line
 * @returns {Promise<number>} the process exit code: 0 done (an unlearnable stage is a result, not a failure), 1 on bad input
 */
export async function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        const stages = await runFeasible(parseArgs(argv));
        for (const line of formatFeasible(stages)) {
            print(line);
        }
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
