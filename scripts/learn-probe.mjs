// The learn probe (`npm run probe:learn`): evolves populations of random brains on one lesson's win share and prints what
// they reach (docs/designs/senses-and-motor.md, Lesson probes). It writes no genome and no champion file: the
// populations are discarded. Logs `LearnGeneration` at debug level to `.sim/logs/learn-<seeds>x<generations>.jsonl`.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { LEARN_GENERATIONS, LEARN_POPULATION, LEARN_SEEDS, LEARN_TRIALS } from '../js/evo/learn-probe.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { formatLearn, summarise } from './lib/learn-report.mjs';
import { logRunConfig } from './lib/run-config.mjs';
import { runPool } from './lib/worker-pool.mjs';

const WORKER_URL = new URL('./learn-worker.mjs', import.meta.url);
const NAMES = DRILLS.map((d) => d.name);
const USAGE =
    'usage: probe:learn [--lessons <a,b>] [--generations <n>] [--seeds <n>] [--population <n>] [--trials <n>] [--config <file.json>] [--workers <n>] [--out <path>]';

/**
 * @typedef {object} LearnArgs
 * @property {string[]} lessons the lessons (drills) to learn (default all)
 * @property {number} generations generations per population
 * @property {number} seeds populations per lesson
 * @property {number} population brains per generation
 * @property {number} trials trials per brain per generation
 * @property {string | null} config a config overrides file
 * @property {number | undefined} workers pool size, undefined for the default
 * @property {string | null} out a file to write the table to
 */

/**
 * @param {string | undefined} value `a,b`
 * @returns {string[]} the lesson names
 * @throws {Error} on an unknown lesson, listing the known ones
 */
function parseLessons(value) {
    const names = String(value).split(',');
    const bad = names.find((name) => !NAMES.includes(name));
    if (bad !== undefined) {
        throw new Error(`--lessons: unknown lesson "${bad}"; known: ${NAMES.join(', ')}\n${USAGE}`);
    }
    return names;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {LearnArgs} parsed options
 */
export function parseArgs(argv) {
    return /** @type {LearnArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--lessons': (v) => ['lessons', parseLessons(v)],
                '--generations': (v, f) => ['generations', intValue(f, v, 1, USAGE)],
                '--seeds': (v, f) => ['seeds', intValue(f, v, 1, USAGE)],
                '--population': (v, f) => ['population', intValue(f, v, 2, USAGE)],
                '--trials': (v, f) => ['trials', intValue(f, v, 1, USAGE)],
                '--config': (v) => ['config', String(v)],
                '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
                '--out': (v) => ['out', String(v)],
            },
            defaults: {
                lessons: NAMES,
                generations: LEARN_GENERATIONS,
                seeds: LEARN_SEEDS,
                population: LEARN_POPULATION,
                trials: LEARN_TRIALS,
                config: null,
                workers: undefined,
                out: null,
            },
            usage: USAGE,
        })
    );
}

/**
 * @param {LearnArgs} args the options
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the table prints
 * @returns {Promise<import('../js/evo/learn-probe.js').LearnResult[]>} one result per lesson and seed
 */
export async function runLearnProbe(args, { logDir = '.sim/logs', print = console.log } = {}) {
    const config = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    const path = join(logDir, `learn-${args.seeds}x${args.generations}.jsonl`);
    rmSync(path, { force: true });
    const file = createJsonlSink(path);
    try {
        const log = createSimLog(file.sink, { level: 'debug' });
        const seeds = Array.from({ length: args.seeds }, (_, i) => i + 1);
        logRunConfig(log, {
            tool: 'probe-learn',
            policy: null,
            configHash: configHash(createConfig(config)),
            seeds,
            ticks: null,
        });
        const tasks = args.lessons.flatMap((lesson) =>
            seeds.map((seed) => ({
                lesson,
                seed,
                generations: args.generations,
                population: args.population,
                trials: args.trials,
                config,
            })),
        );
        /** @type {import('../js/evo/learn-probe.js').LearnResult[]} */
        const results = await runPool(tasks, { workerUrl: WORKER_URL, workers: args.workers });
        for (const result of results) {
            result.curve.forEach((best, generation) =>
                log.log('debug', 'LearnGeneration', { lesson: result.lesson, seed: result.seed, generation, best }),
            );
        }
        const text = formatLearn(summarise(results));
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
    return exitCodeOf(() => runLearnProbe(parseArgs(argv), io));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
