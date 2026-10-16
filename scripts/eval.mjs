// Eval runner: runs a policy on fixed seeds across a worker pool and writes a report (`npm run eval`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, validateReport } from '../js/evo/report.js';
import { getPolicy, LIVE_POLICY, POLICIES } from '../js/evo/policies/index.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { createMetrics } from './lib/otel.mjs';
import { runPool } from './lib/worker-pool.mjs';

const SEEDS_URL = new URL('../evals/seeds.json', import.meta.url);
const WORKER_URL = new URL('./eval-worker.mjs', import.meta.url);
const CPU_PRINT_MS = 10_000;
const USAGE =
    'usage: eval [--seeds <n>] [--ticks <t>] [--policy <name>|live] [--seed-offset <k>] [--config <file.json>] [--out <path>] [--workers <n>]';

/**
 * @param {string} flag the flag name
 * @param {string | undefined} text the flag's value
 * @param {number} min the smallest allowed value
 * @returns {number} the value as an integer
 */
function intValue(flag, text, min) {
    const value = Number(text);
    if (text === undefined || !Number.isInteger(value) || value < min) {
        throw new Error(`${flag} must be an integer >= ${min}, got: ${text}\n${USAGE}`);
    }
    return value;
}

/**
 * @typedef {object} EvalArgs
 * @property {number} seeds
 * @property {number} ticks
 * @property {string} policy a key of `POLICIES`
 * @property {number} seedOffset
 * @property {string | null} config
 * @property {string | null} out
 * @property {number | null} workers
 */

/** @type {Record<string, (value: string | undefined, flag: string) => [string, any]>} */
const VALUE_FLAGS = {
    '--seeds': (value, flag) => ['seeds', intValue(flag, value, 1)],
    '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1)],
    '--seed-offset': (value, flag) => ['seedOffset', intValue(flag, value, 0)],
    '--workers': (value, flag) => ['workers', intValue(flag, value, 1)],
    '--policy': (value) => ['policy', parsePolicy(value)],
    '--config': (value) => ['config', String(value)],
    '--out': (value) => ['out', String(value)],
};

/**
 * @param {string | undefined} value a policy name, or `live`
 * @returns {string} the policy name
 */
function parsePolicy(value) {
    const name = value === 'live' ? LIVE_POLICY : value;
    if (name === undefined || !Object.hasOwn(POLICIES, name)) {
        throw new Error(
            `--policy: Unknown policy "${value}"; known: live, ${Object.keys(POLICIES).join(', ')}\n${USAGE}`,
        );
    }
    return name;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {EvalArgs} parsed options
 */
export function parseArgs(argv) {
    /** @type {EvalArgs} */
    const opts = {
        seeds: 8,
        ticks: 200000,
        policy: LIVE_POLICY,
        seedOffset: 0,
        config: null,
        out: null,
        workers: null,
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (!Object.hasOwn(VALUE_FLAGS, flag)) {
            throw new Error(`unknown argument: ${flag}\n${USAGE}`);
        }
        const [key, parsed] = VALUE_FLAGS[flag](argv[++i], flag);
        Object.assign(opts, { [key]: parsed });
    }
    return opts;
}

/**
 * @param {number} seeds how many seeds
 * @param {number} offset the first seed index
 * @returns {number[]} `evals/seeds.json` entries `[offset, offset + seeds)`
 * @throws {Error} when the range runs past the 32 fixed seeds
 */
export function pickSeeds(seeds, offset) {
    const all = JSON.parse(readFileSync(SEEDS_URL, 'utf8'));
    if (seeds + offset > all.length) {
        throw new Error(`--seeds + --seed-offset must be <= ${all.length}, got ${seeds + offset}\n${USAGE}`);
    }
    return all.slice(offset, offset + seeds);
}

/**
 * @typedef {{ user: number, nice: number, sys: number, idle: number, irq: number }} CpuTimes
 */

/**
 * @param {readonly { times: CpuTimes }[]} before `os.cpus()` at the start of the interval
 * @param {readonly { times: CpuTimes }[]} after `os.cpus()` at its end
 * @returns {{ pct: number, threads: number }} the share of CPU time not idle (0 to 100) and the thread count
 */
export function cpuUse(before, after) {
    let busy = 0;
    let total = 0;
    after.forEach((cpu, i) => {
        const a = cpu.times;
        const b = before[i].times;
        const all = a.user + a.nice + a.sys + a.irq + a.idle - (b.user + b.nice + b.sys + b.irq + b.idle);
        total += all;
        busy += all - (a.idle - b.idle);
    });
    return { pct: total > 0 ? (100 * busy) / total : 0, threads: after.length };
}

/**
 * @param {(line: string) => void} print receives the CPU line
 * @returns {{ stop: () => void }} a reporter that prints `cpu <pct>% of <n> threads` every 10 s, and once on stop
 */
function startCpuReport(print) {
    let last = cpus();
    const report = () => {
        const now = cpus();
        const { pct, threads } = cpuUse(last, now);
        print(`cpu ${pct.toFixed(0)}% of ${threads} threads`);
        last = now;
    };
    const first = last;
    const timer = setInterval(report, CPU_PRINT_MS);
    timer.unref();
    return {
        stop() {
            clearInterval(timer);
            const { pct, threads } = cpuUse(first, cpus());
            print(`cpu ${pct.toFixed(0)}% of ${threads} threads (whole run)`);
        },
    };
}

/**
 * @returns {string} the short commit sha, or `unknown`
 */
function gitSha() {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { env, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return 'unknown';
    }
}

/**
 * @param {import('./lib/otel.mjs').Metrics} metrics the recorder
 * @param {string} policy the policy name
 * @param {Record<string, any>} result one seed's result
 * @returns {void}
 */
function recordCheckpoints(metrics, policy, result) {
    if (!metrics.enabled) {
        return;
    }
    const attrs = { policy, seed: result.seed };
    for (const point of result.checkpoints) {
        metrics.record('eval.population', point.population, attrs);
        metrics.record('eval.births', point.births, attrs);
        metrics.record('eval.deaths', point.deaths, attrs);
    }
}

/**
 * @param {unknown} error what the run threw
 * @returns {Record<string, any>} the `SeedFailed` log record
 */
function failureRecord(error) {
    const message = error instanceof Error ? error.message : String(error);
    const { seed, tick } = failureDetail(message);
    return {
        level: 'error',
        event: 'SeedFailed',
        seed,
        tick,
        error: message.split('\n')[0],
        stack: error instanceof Error ? error.stack : undefined,
    };
}

/**
 * @typedef {object} EvalOptions
 * @property {number} [seeds] default 8
 * @property {number} ticks
 * @property {string} [policy] a key of `POLICIES`, default the live policy
 * @property {number} [seedOffset] default 0
 * @property {Record<string, any>} [configOverrides] default `{}`
 * @property {string | null} [out] default `evals/results/<policy>-<sha>-<n>x<t>.json`
 * @property {number | null} [workers] default `os.availableParallelism()`, capped at the seed count
 * @property {string} [logDir] default `.sim/logs`
 * @property {string} [sha] default `git rev-parse --short HEAD`
 * @property {import('./lib/otel.mjs').Metrics} [metrics]
 * @property {(line: string) => void} [print] receives the summary lines
 */

/**
 * @param {string} message a worker failure, `task <i> failed: seed <s> failed at tick <t>: ...`
 * @returns {{ seed: number | null, tick: number | null }} what the message names
 */
function failureDetail(message) {
    const match = /seed (\d+) failed at tick (\d+)/.exec(message);
    return { seed: match ? Number(match[1]) : null, tick: match ? Number(match[2]) : null };
}

/**
 * @param {EvalOptions} options the run options
 * @returns {{ policyName: string, seeds: number[], overrides: Record<string, any>, sha: string, runId: string }} the
 *   resolved run: the config overrides have `seed` removed, since each task sets its own
 */
function resolveRun(options) {
    const { seeds: count = 8, ticks, seedOffset = 0, configOverrides = {} } = options;
    const policyName = options.policy ?? LIVE_POLICY;
    const overrides = Object.fromEntries(Object.entries(configOverrides).filter(([key]) => key !== 'seed'));
    const sha = options.sha ?? gitSha();
    return {
        policyName,
        seeds: pickSeeds(count, seedOffset),
        overrides,
        sha,
        runId: `${policyName}-${sha}-${count}x${ticks}`,
    };
}

/**
 * @param {{ jsonl: import('./lib/jsonl-sink.mjs').JsonlSink, metrics: import('./lib/otel.mjs').Metrics, policyName: string, print: (line: string) => void }} ctx
 *   where each finished seed is logged, recorded and printed
 * @returns {(index: number, result: Record<string, any>) => void} the pool's `onResult`
 */
function seedLogger({ jsonl, metrics, policyName, print }) {
    return (_index, result) => {
        jsonl.sink({
            level: 'info',
            event: 'SeedFinished',
            seed: result.seed,
            wallMs: result.wallMs,
            worldHash: result.worldHash,
        });
        recordCheckpoints(metrics, policyName, result);
        print(`seed ${result.seed} done in ${(result.wallMs / 1000).toFixed(1)}s worldHash ${result.worldHash}`);
    };
}

/**
 * Builds the report from the per-seed results (no timing goes in), validates it and writes it as JSON.
 * @param {{ policyName: string, results: Record<string, any>[], config: Record<string, any>, ticks: number, seeds: number[], sha: string, out: string }} input the run
 * @returns {Record<string, any>} the report
 */
function buildAndWrite({ policyName, results, config, ticks, seeds, sha, out }) {
    const report = buildReport({
        policy: policyName,
        fitnessName: results[0].fitnessName,
        config,
        ticks,
        seeds,
        sha,
        perSeed: results.map((r) => r.metrics),
    });
    validateReport(report);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    return report;
}

/**
 * Runs the seeds across the pool and returns the validated report.
 * @param {EvalOptions} options the run options
 * @returns {Promise<{ report: Record<string, any>, out: string, results: Record<string, any>[] }>} the report, the
 *   path it was written to, and the raw per-seed results (with `wallMs`)
 */
export async function runEval(options) {
    const { ticks, logDir = '.sim/logs' } = options;
    const { policyName, seeds, overrides, sha, runId } = resolveRun(options);
    const config = createConfig(overrides);
    const out = options.out ?? join('evals', 'results', `${runId}.json`);
    const logPath = join(logDir, `eval-${runId}.jsonl`);
    rmSync(logPath, { force: true });
    const jsonl = createJsonlSink(logPath);
    const metrics = options.metrics ?? (await createMetrics());
    const print = options.print ?? (() => {});
    const workers = options.workers ?? Math.min(availableParallelism(), seeds.length);
    jsonl.sink({
        level: 'info',
        event: 'EvalStarted',
        policy: policyName,
        seeds,
        ticks,
        workers,
        configHash: configHash(config),
    });
    const cpu = startCpuReport(print);
    const started = performance.now();
    try {
        const tasks = seeds.map((seed) => ({ seed, ticks, policy: policyName, overrides }));
        const onResult = seedLogger({ jsonl, metrics, policyName, print });
        const results = await runPool(tasks, { workerUrl: WORKER_URL, workers, onResult });
        const report = buildAndWrite({ policyName, results, config, ticks, seeds, sha, out });
        const wallMs = performance.now() - started;
        jsonl.sink({ level: 'info', event: 'EvalFinished', out, wallMs });
        print(
            `wrote ${out} (${seeds.length} seeds x ${ticks} ticks, ${workers} workers, ${(wallMs / 1000).toFixed(1)}s)`,
        );
        return { report, out, results };
    } catch (error) {
        jsonl.sink(failureRecord(error));
        throw error;
    } finally {
        cpu.stop();
        await jsonl.close();
        await metrics.shutdown();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{ logDir?: string }} [dirs] output directories
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, { logDir } = {}) {
    const args = parseArgs(argv);
    pickSeeds(args.seeds, args.seedOffset);
    getPolicy(args.policy);
    const configOverrides = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    try {
        await runEval({ ...args, configOverrides, logDir, print: (line) => console.log(line) });
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        const { seed, tick } = failureDetail(message);
        if (seed !== null) {
            const config = args.config === null ? '' : ` --config ${args.config}`;
            // The failing step ran at `tick`, so the replay needs one more tick to reach it.
            console.error(
                `reproduce: npm run replay -- --policy ${args.policy}${config} --seed ${seed} --ticks ${Number(tick) + 1}`,
            );
        }
        return 1;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
