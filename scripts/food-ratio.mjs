// Counts what the agents eat and sets it against what the food formula offers (`npm run food:ratio`): plant meals per
// tick, energy stored per meal, and the `foodRegrowPerArea` whose supply equals the eaten rate (carrying-capacity T8).
import { fileURLToPath } from 'node:url';
import { LIVE_POLICY } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { pickSeeds } from './eval.mjs';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { foodRatio } from './lib/food-ratio.mjs';
import { runPool } from './lib/worker-pool.mjs';

const WORKER_URL = new URL('./food-ratio-worker.mjs', import.meta.url);
const USAGE = 'usage: food:ratio [--seeds <n>] [--ticks <t>] [--seed-offset <k>] [--workers <n>] [--json]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{ seeds: number, ticks: number, seedOffset: number, workers: number | null, json: boolean }} options
 */
export function parseArgs(argv) {
    return /** @type {any} */ (
        parseFlags(argv, {
            valueFlags: {
                '--seeds': (value, flag) => ['seeds', intValue(flag, value, 1, USAGE)],
                '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1, USAGE)],
                '--seed-offset': (value, flag) => ['seedOffset', intValue(flag, value, 0, USAGE)],
                '--workers': (value, flag) => ['workers', intValue(flag, value, 1, USAGE)],
            },
            booleanFlags: { '--json': 'json' },
            usage: USAGE,
            defaults: { seeds: 8, ticks: 200000, seedOffset: 0, workers: null, json: false },
        })
    );
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} print where the output goes
 * @returns {Promise<import('./lib/food-ratio.mjs').FoodRatio>} the pooled ratio
 */
export async function runFoodRatio(argv, print) {
    const args = parseArgs(argv);
    const seeds = pickSeeds(args.seeds, args.seedOffset);
    const tasks = seeds.map((seed) => ({ seed, ticks: args.ticks, policy: LIVE_POLICY, overrides: {} }));
    const results = await runPool(tasks, { workerUrl: WORKER_URL, workers: args.workers ?? undefined });
    const ratio = foodRatio(results, createConfig({ seed: 1 }));
    if (args.json) {
        print(JSON.stringify({ seeds, ticks: args.ticks, ...ratio }, null, 2));
    } else {
        for (const [name, value] of Object.entries(ratio)) {
            print(`${name.padEnd(20)}${Number.isInteger(value) ? value : value.toPrecision(5)}`);
        }
    }
    return ratio;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await exitCodeOf(() => runFoodRatio(process.argv.slice(2), console.log));
}
