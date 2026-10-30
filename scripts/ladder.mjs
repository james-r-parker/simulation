// Skill ladder runner: runs every rung of `LADDER_RUNGS` on seeds 1..n across a worker pool (`npm run ladder`).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNG_METRICS } from '../js/evo/controller-run.js';
import { LADDER_RUNGS, ladderSummary } from '../js/evo/ladder.js';
import { createConfig } from '../js/sim/config.js';
import { gitSha } from './eval.mjs';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { runPool } from './lib/worker-pool.mjs';

const WORKER_URL = new URL('./ladder-worker.mjs', import.meta.url);
const USAGE = 'usage: ladder [--ticks <t>] [--seeds <n>] [--config <file.json>] [--out <path>] [--workers <n>]';

/**
 * @typedef {object} LadderArgs
 * @property {number} ticks
 * @property {number} seeds seeds 1 to this number
 * @property {string | null} config
 * @property {string | null} out
 * @property {number | null} workers
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {LadderArgs} parsed options
 */
export function parseArgs(argv) {
    return /** @type {LadderArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1, USAGE)],
                '--seeds': (value, flag) => ['seeds', intValue(flag, value, 1, USAGE)],
                '--workers': (value, flag) => ['workers', intValue(flag, value, 1, USAGE)],
                '--config': (value) => ['config', String(value)],
                '--out': (value) => ['out', String(value)],
            },
            defaults: { ticks: 10000, seeds: 3, config: null, out: null, workers: null },
            usage: USAGE,
        })
    );
}

/**
 * @param {readonly (number | null)[]} values one metric's value on each seed
 * @returns {number | null} the mean of the non-null values, `null` when every seed is `null`
 */
function meanOrNull(values) {
    const present = /** @type {number[]} */ (values.filter((value) => value !== null));
    return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length;
}

/**
 * @param {Record<string, any>[]} runs every seed's run of one rung
 * @returns {Record<string, number | null>} each recorded metric's mean over the seeds
 */
function meanMetrics(runs) {
    return Object.fromEntries(RUNG_METRICS.map((name) => [name, meanOrNull(runs.map((run) => run.metrics[name]))]));
}

/**
 * @typedef {object} LadderOptions
 * @property {number} ticks
 * @property {number} [seeds] seeds 1 to this number, default 3
 * @property {Record<string, any>} [configOverrides] default `{}`
 * @property {readonly string[]} [rungs] rung names to run, default every rung
 * @property {string | null} [out] default `evals/ladder/<id>.json`
 * @property {number | null} [workers] default `os.availableParallelism()`, capped at the task count
 * @property {string} [logDir] default `.sim/logs`
 * @property {string} [sha] default `git rev-parse --short HEAD`
 * @property {(line: string) => void} [print] receives the summary lines
 */

/**
 * @param {{jsonl: import('./lib/jsonl-sink.mjs').JsonlSink, seedCount: number, print: (line: string) => void}} ctx the
 *   log and the summary output
 * @returns {(index: number, result: Record<string, any>) => void} the pool's `onResult`: it logs a rung once all its
 *   seeds are in
 */
function rungLogger({ jsonl, seedCount, print }) {
    /** @type {Map<string, Record<string, any>[]>} */
    const done = new Map();
    return (_index, result) => {
        const runs = [...(done.get(result.rung) ?? []), result];
        done.set(result.rung, runs);
        if (runs.length === seedCount) {
            const meanPopulation = runs.reduce((sum, run) => sum + run.population, 0) / runs.length;
            const wallMs = runs.reduce((sum, run) => sum + run.wallMs, 0);
            jsonl.sink({ level: 'info', event: 'LadderRungDone', rung: result.rung, meanPopulation, wallMs });
            print(`rung ${result.rung} done: mean final population ${meanPopulation.toFixed(1)}`);
        }
    };
}

/**
 * @param {LadderOptions} options the run options
 * @param {string} id the run id
 * @returns {{rungs: string[], seeds: number[], config: Record<string, any>, out: string, workers: number,
 *   tasks: import('./ladder-worker.mjs').LadderTask[]}} what to run
 * @throws {Error} when the config overrides are invalid
 */
function planRun(options, id) {
    const { ticks, seeds: seedCount = 3, configOverrides = {} } = options;
    const rungs = LADDER_RUNGS.filter((rung) => options.rungs === undefined || options.rungs.includes(rung.name));
    const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);
    const tasks = rungs.flatMap(({ name }) =>
        seeds.map((seed) => ({ rung: name, seed, ticks, overrides: configOverrides })),
    );
    return {
        rungs: rungs.map((rung) => rung.name),
        seeds,
        config: createConfig({ ...configOverrides, minAgents: 0 }),
        out: options.out ?? join('evals', 'ladder', `${id}.json`),
        workers: options.workers ?? Math.min(availableParallelism(), tasks.length),
        tasks,
    };
}

/**
 * @param {{id: string, sha: string, ticks: number, seeds: number[], configOverrides: Record<string, any>}} run the run
 * @param {import('../js/evo/ladder.js').RungSummary[]} summary the rungs' summaries
 * @param {Record<string, any>[]} results every rung and seed's run
 * @returns {Record<string, any>} the ladder report
 */
function buildReport({ id, sha, ticks, seeds, configOverrides }, summary, results) {
    const rungs = summary.map((row) => {
        const runs = results.filter((run) => run.rung === row.rung);
        const perSeed = runs.map((run) => ({ seed: run.seed, population: run.population }));
        return { ...row, metrics: meanMetrics(runs), perSeed };
    });
    return { version: 1, id, ticks, seeds, config: configOverrides, sha, rungs };
}

/**
 * @param {unknown} error what the run threw
 * @returns {Record<string, any>} the `LadderFailed` log record
 */
function failureRecord(error) {
    const message = error instanceof Error ? error.message : String(error);
    const [, rung, seed] = /rung (\S+) seed (\d+) failed/.exec(message) ?? [];
    const failed = { rung: rung ?? null, seed: seed ? Number(seed) : null };
    return { level: 'error', event: 'LadderFailed', ...failed, error: message.split('\n')[0] };
}

/**
 * Runs the rungs on the pool and writes the ladder report.
 * @param {LadderOptions} options the run options
 * @returns {Promise<{report: Record<string, any>, out: string}>} the report and the path it was written to
 */
export async function runLadder(options) {
    const { ticks, seeds: seedCount = 3, configOverrides = {}, logDir = '.sim/logs', print = () => {} } = options;
    const sha = options.sha ?? gitSha();
    const id = `${sha}-${seedCount}x${ticks}`;
    const logPath = join(logDir, `ladder-${id}.jsonl`);
    rmSync(logPath, { force: true });
    const jsonl = createJsonlSink(logPath);
    try {
        const plan = planRun(options, id);
        const { rungs, seeds, workers, out } = plan;
        jsonl.sink({ level: 'info', event: 'LadderStarted', rungs, seeds, ticks, workers });
        const onResult = rungLogger({ jsonl, seedCount, print });
        const results = await runPool(plan.tasks, { workerUrl: WORKER_URL, workers, onResult });
        const summary = ladderSummary(results, { maxAgents: Number(plan.config.maxAgents) });
        for (const row of summary.filter((r) => r.saturated)) {
            jsonl.sink({ level: 'warn', event: 'LadderSaturated', rung: row.rung, meanPopulation: row.meanPopulation });
            print(`rung ${row.rung} saturated at ${row.meanPopulation.toFixed(1)} of ${plan.config.maxAgents}`);
        }
        const report = buildReport({ id, sha, ticks, seeds, configOverrides }, summary, results);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
        print(`wrote ${out} (${rungs.length} rungs x ${seedCount} seeds x ${ticks} ticks, ${workers} workers)`);
        return { report, out };
    } catch (error) {
        jsonl.sink(failureRecord(error));
        throw error;
    } finally {
        await jsonl.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string}} [dirs] output directories
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, { logDir } = {}) {
    return exitCodeOf(async () => {
        const args = parseArgs(argv);
        const configOverrides = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
        await runLadder({ ...args, configOverrides, logDir, print: (line) => console.log(line) });
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
