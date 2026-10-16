// Parallel throughput bench (`npm run bench:parallel`): n identical bench worlds at once, one per worker.
// Total throughput `bench.parallel_ticks_per_s@<n>` = n * ticks / max(elapsed), where elapsed is each worker's own
// step-loop time (world build excluded) and max is the slowest worker's, so it is the ticks per second the whole
// pool sustains while every worker is busy.
import { availableParallelism, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cpuUse } from './eval.mjs';
import { runPool } from './lib/worker-pool.mjs';

const DEFAULT_COUNTS = [1, 8, 16, 24, 32];
const BENCH_SEED = 4242;
const SMT_THRESHOLD = 0.05;

/**
 * @param {string} flag the flag name
 * @param {string} text the raw value
 * @returns {number} the positive integer
 */
function positiveInt(flag, text) {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1) {
        throw new Error(`${flag} must be a positive integer, got: ${text}`);
    }
    return n;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{counts: number[], ticks: number, agents: number, json: boolean}} parsed options
 */
export function parseArgs(argv) {
    const options = { counts: DEFAULT_COUNTS, ticks: 2000, agents: 500, json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--json') {
            options.json = true;
        } else if (arg === '--counts' || arg === '--ticks' || arg === '--agents') {
            const value = argv[++i];
            if (value === undefined) {
                throw new Error(`${arg} needs a value`);
            }
            if (arg === '--counts') {
                options.counts = value.split(',').map((part) => positiveInt(arg, part));
            } else {
                options[arg === '--ticks' ? 'ticks' : 'agents'] = positiveInt(arg, value);
            }
        } else {
            throw new Error(`unknown argument: ${arg} (expected --counts 1,8,16 --ticks N --agents N --json)`);
        }
    }
    return options;
}

/**
 * @param {readonly { ticks: number, elapsedMs: number }[]} results one entry per worker
 * @returns {number} total ticks per second: sum of ticks over the slowest worker's loop time in seconds
 */
export function throughput(results) {
    const total = results.reduce((sum, r) => sum + r.ticks, 0);
    const slowest = Math.max(...results.map((r) => r.elapsedMs));
    return slowest > 0 ? (total * 1000) / slowest : 0;
}

/**
 * @param {number} total total ticks per second at some count
 * @param {number} single total ticks per second at one worker
 * @returns {number} the gain over one worker (1 = no gain)
 */
export function gain(total, single) {
    return single > 0 ? total / single : 0;
}

/**
 * The doc's rule: the highest count, unless 32 beats 16 by under 5%, then the physical core count.
 * @param {Record<number, number>} totals total ticks per second by worker count
 * @param {number} physicalCores physical cores to fall back to
 * @returns {number} the recommended worker count
 */
export function recommendDefault(totals, physicalCores) {
    const counts = Object.keys(totals).map(Number);
    const highest = Math.max(...counts);
    if (highest === 32 && totals[16] > 0 && totals[32] < totals[16] * (1 + SMT_THRESHOLD)) {
        return physicalCores;
    }
    return highest;
}

/**
 * @param {number} count workers (and worlds) in the wave
 * @param {{ticks: number, agents: number}} options ticks and agents per world
 * @returns {Promise<{ total: number, cpu: { pct: number, threads: number } }>} the wave's throughput and CPU use
 */
export async function runWave(count, { ticks, agents }) {
    const tasks = Array.from({ length: count }, (_, i) => ({ seed: BENCH_SEED + i, ticks, agents }));
    const before = cpus();
    const results = await runPool(tasks, {
        workerUrl: new URL('./bench-parallel-worker.mjs', import.meta.url),
        workers: count,
    });
    return { total: throughput(results), cpu: cpuUse(before, cpus()) };
}

/**
 * @param {{count: number, total: number, single: number, cpu: {pct: number, threads: number}}} row one wave
 * @returns {string} one table line
 */
function formatRow({ count, total, single, cpu }) {
    const g = gain(total, single);
    return [
        String(count).padStart(3),
        total.toFixed(0).padStart(10),
        (total / count).toFixed(0).padStart(10),
        `${g.toFixed(2)}x`.padStart(7),
        `${((100 * g) / count).toFixed(0)}%`.padStart(6),
        `cpu ${cpu.pct.toFixed(0)}% of ${cpu.threads} threads`,
    ].join('  ');
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<void>}
 */
export async function main(argv) {
    const { counts, ticks, agents, json } = parseArgs(argv);
    /** @type {Record<number, number>} */
    const totals = {};
    /** @type {string[]} */
    const lines = [];
    for (const count of counts) {
        const { total, cpu } = await runWave(count, { ticks, agents });
        totals[count] = total;
        lines.push(formatRow({ count, total, single: totals[counts[0]], cpu }));
    }
    const physical = Math.max(1, availableParallelism() >> 1);
    const recommended = recommendDefault(totals, physical);
    if (json) {
        /** @type {Record<string, number>} */
        const metrics = { 'bench.recommended_workers': recommended };
        for (const count of counts) {
            metrics[`bench.parallel_ticks_per_s@${count}`] = Math.round(totals[count] * 100) / 100;
        }
        console.log(JSON.stringify(metrics, null, 2));
        return;
    }
    console.log(`${agents} agents, ${ticks} ticks per world; gain is over ${counts[0]} worker(s)`);
    console.log('  n  ticks/s    per-worker   gain    eff   cpu');
    lines.forEach((line) => console.log(line));
    console.log(
        `recommended default: ${recommended} workers (assumes SMT: physical cores = availableParallelism ${availableParallelism()} / 2 = ${physical})`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main(process.argv.slice(2));
}
