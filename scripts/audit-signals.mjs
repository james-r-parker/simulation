// The signal census (`npm run audit:signals`): runs a policy on fixed seeds with the census attached and prints one row
// per brain input and per output (docs/designs/senses-and-motor.md, Signal census). Logs one `SignalCensusRow` per input
// and output at info level to `.sim/logs/audit-signals-<first seed>x<seeds>.jsonl`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIVE_POLICY } from '../js/evo/policies/index.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { emitReport, runAsMain, sharedFlags, withLogFile } from './lib/audit-io.mjs';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { logRunConfig, resolvePolicyFlag } from './lib/run-config.mjs';
import { formatInputs, formatOutputs, inputNames, mergeInputs } from './lib/signal-report.mjs';
import { runPool } from './lib/worker-pool.mjs';

const WORKER_URL = new URL('./signals-worker.mjs', import.meta.url);
const USAGE =
    'usage: audit-signals [--seeds <n>] [--ticks <t>] [--seed-offset <k>] [--policy <name>|live] [--config <file.json>] [--workers <n>] [--out <path>]';

/**
 * @typedef {object} SignalsArgs
 * @property {number} seeds seeds to run (1, 2, ...)
 * @property {number} ticks ticks per seed
 * @property {number} seedOffset added to each seed
 * @property {string} policy the policy name
 * @property {string | null} config a config overrides file
 * @property {number | null} workers pool size, null for the default
 * @property {string | null} out a file to write the tables to
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {SignalsArgs} parsed options
 */
export function parseArgs(argv) {
    return /** @type {SignalsArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--seeds': (v, f) => ['seeds', intValue(f, v, 1, USAGE)],
                '--ticks': (v, f) => ['ticks', intValue(f, v, 1, USAGE)],
                '--seed-offset': (v, f) => ['seedOffset', intValue(f, v, 0, USAGE)],
                '--policy': (v) => ['policy', resolvePolicyFlag(v, USAGE)],
                ...sharedFlags(USAGE),
            },
            defaults: {
                seeds: 16,
                ticks: 200000,
                seedOffset: 0,
                policy: LIVE_POLICY,
                config: null,
                workers: null,
                out: null,
            },
            usage: USAGE,
        })
    );
}

/**
 * @param {SignalsArgs} args the options
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the tables print
 * @returns {Promise<Record<string, any>[]>} one result per seed
 */
export async function runSignalsAudit(args, { logDir = '.sim/logs', print = console.log } = {}) {
    const overrides = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    const seeds = Array.from({ length: args.seeds }, (_, i) => args.seedOffset + i + 1);
    const path = join(logDir, `audit-signals-${seeds[0]}x${args.seeds}.jsonl`);
    return withLogFile({ path, level: 'info' }, async (log) => {
        logRunConfig(log, {
            tool: 'audit-signals',
            policy: args.policy,
            configHash: configHash(createConfig(overrides)),
            seeds,
            ticks: args.ticks,
        });
        const tasks = seeds.map((seed) => ({ seed, ticks: args.ticks, policy: args.policy, overrides }));
        const results = await runPool(tasks, { workerUrl: WORKER_URL, workers: args.workers ?? undefined });
        const merged = mergeInputs(results.map((r) => r.inputs));
        const names = inputNames();
        for (const row of merged) {
            log.log('info', 'SignalCensusRow', { kind: 'input', name: names[row.index], ...row });
        }
        for (const row of results[0].outputs) {
            log.log('info', 'SignalCensusRow', { kind: 'output', ...row });
        }
        const text = [
            `${args.seeds} seed(s) x ${args.ticks} ticks, policy ${args.policy}`,
            formatInputs(merged),
            formatOutputs(results.map((r) => r.outputs)),
        ].join('\n\n');
        emitReport(text, { print, out: args.out });
        return results;
    });
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the tables print
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}) {
    return exitCodeOf(() => runSignalsAudit(parseArgs(argv), io));
}

await runAsMain(import.meta.url, main);
