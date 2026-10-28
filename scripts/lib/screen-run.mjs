// Screen run: runs every pending arm's seeds through one shared worker pool and writes one report per arm.
// An arm whose report already exists for the same config, seeds, ticks, policy and policy options is skipped (resume).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, seedlessConfig, validateReport } from '../../js/evo/report.js';
import { LIVE_POLICY } from '../../js/evo/policies/index.js';
import { canonicalOptions } from '../../js/evo/policy-options.js';
import { configHash, createConfig } from '../../js/sim/config.js';
import { gitSha, pickSeeds } from '../eval.mjs';
import { runPool } from './worker-pool.mjs';

const WORKER_URL = new URL('../eval-worker.mjs', import.meta.url);

/**
 * @param {string} outDir the screen's output directory
 * @param {string} arm an arm name
 * @returns {string} the arm's report path
 */
export function reportPath(outDir, arm) {
    return join(outDir, `${arm}.report.json`);
}

/**
 * @typedef {object} Expected
 * @property {string} configHash the hash of the arm's seedless config
 * @property {number} ticks ticks per seed
 * @property {number[]} seeds the seeds, in order
 * @property {string} policy the policy name
 * @property {string} [policyOptions] the arm's policy options as `canonicalOptions` text, default `{}`
 */

/**
 * @param {any} report a parsed report
 * @param {Expected} expected what the arm should have run
 * @returns {boolean} whether the report is for that run (the policy options included; a report without any has `{}`)
 *   and carries traces
 */
export function reportMatches(report, expected) {
    return (
        report?.configHash === expected.configHash &&
        report.ticks === expected.ticks &&
        report.policy === expected.policy &&
        canonicalOptions(report.policyOptions) === (expected.policyOptions ?? '{}') &&
        Array.isArray(report.traces) &&
        JSON.stringify(report.seeds) === JSON.stringify(expected.seeds)
    );
}

/**
 * @param {string} path a report path
 * @param {Expected} expected what the arm should have run
 * @returns {Record<string, any> | null} the report when the file is a valid report for `expected`, else null
 */
export function loadReusable(path, expected) {
    if (!existsSync(path)) {
        return null;
    }
    try {
        const report = JSON.parse(readFileSync(path, 'utf8'));
        validateReport(report);
        return reportMatches(report, expected) ? report : null;
    } catch {
        return null;
    }
}

/**
 * @typedef {object} ScreenRunOptions
 * @property {import('./screen-grid.mjs').ScreenPlan} plan the arms and seeds
 * @property {string} outDir where the reports go
 * @property {number} workers the total worker budget across all arms and seeds
 * @property {boolean} [force] rerun arms that already have a matching report
 * @property {number | null} [traceInterval] ticks between population samples
 * @property {string} [sha] default `git rev-parse --short HEAD`
 * @property {(line: string) => void} [print] receives progress lines
 */

/**
 * @param {import('./screen-grid.mjs').Arm} arm an arm
 * @param {ScreenRunOptions} options the run options
 * @returns {{ config: Record<string, any>, expected: Expected, seeds: number[] }} the arm resolved
 */
function resolveArm(arm, { plan }) {
    const policy = plan.policy === 'live' ? LIVE_POLICY : plan.policy;
    const seeds = pickSeeds(plan.seeds, plan.seedOffset);
    const config = createConfig(arm.overrides);
    const expected = {
        configHash: configHash(seedlessConfig(config)),
        ticks: plan.ticks,
        seeds,
        policy,
        policyOptions: canonicalOptions(arm.policyOptions),
    };
    return { config, expected, seeds };
}

/**
 * @typedef {object} Pending
 * @property {ReturnType<typeof resolveArm>} resolved the arm resolved
 * @property {any[]} results the seeds' results by slot
 * @property {Record<string, any>} policyOptions the arm's policy options
 * @property {number} left seeds still running
 */

/**
 * Splits the plan into arms to reuse and one flat task list for the rest.
 * @param {ScreenRunOptions} options the run options
 * @returns {{ reports: Record<string, Record<string, any>>, skipped: string[], pending: Record<string, Pending>, tasks: any[], owners: { arm: string, slot: number }[] }}
 *   the reused reports, and for the rest the tasks and which arm and seed slot each belongs to
 */
function planTasks(options) {
    const { plan, outDir, force = false } = options;
    /** @type {Record<string, Record<string, any>>} */
    const reports = {};
    const skipped = [];
    /** @type {any[]} */
    const tasks = [];
    /** @type {{ arm: string, slot: number }[]} */
    const owners = [];
    /** @type {Record<string, Pending>} */
    const pending = {};
    for (const arm of plan.arms) {
        const resolved = resolveArm(arm, options);
        const reusable = force ? null : loadReusable(reportPath(outDir, arm.name), resolved.expected);
        if (reusable !== null) {
            reports[arm.name] = reusable;
            skipped.push(arm.name);
            continue;
        }
        pending[arm.name] = { resolved, results: [], policyOptions: arm.policyOptions, left: resolved.seeds.length };
        const overrides = Object.fromEntries(Object.entries(arm.overrides).filter(([key]) => key !== 'seed'));
        const { policy } = resolved.expected;
        resolved.seeds.forEach((seed, slot) => {
            tasks.push({
                seed,
                ticks: plan.ticks,
                policy,
                overrides,
                policyOptions: arm.policyOptions,
                traceInterval: options.traceInterval ?? undefined,
            });
            owners.push({ arm: arm.name, slot });
        });
    }
    return { reports, skipped, pending, tasks, owners };
}

/**
 * Builds, validates and atomically writes one arm's report.
 * @param {{ name: string, pending: Pending, ticks: number, sha: string, outDir: string }} input the finished arm
 * @returns {Record<string, any>} the report
 */
function writeArmReport({ name, pending, ticks, sha, outDir }) {
    const { resolved, results } = pending;
    const report = buildReport({
        policy: resolved.expected.policy,
        policyOptions: pending.policyOptions,
        fitnessName: results[0].fitnessName,
        config: resolved.config,
        ticks,
        seeds: resolved.seeds,
        sha,
        perSeed: results.map((r) => r.metrics),
        traces: results.map((r) => r.trace),
    });
    validateReport(report);
    const path = reportPath(outDir, name);
    writeFileSync(`${path}.tmp`, `${JSON.stringify(report)}\n`);
    renameSync(`${path}.tmp`, path);
    return report;
}

/**
 * Runs the pending arms and returns every arm's report, reused or fresh.
 * @param {ScreenRunOptions} options the run options
 * @returns {Promise<{ reports: Record<string, Record<string, any>>, ran: string[], skipped: string[] }>} reports by
 *   arm name in plan order, and which arms ran or were reused
 */
export async function runScreen(options) {
    const { plan, outDir, workers, print = () => {} } = options;
    const sha = options.sha ?? gitSha();
    mkdirSync(outDir, { recursive: true });
    const { reports, skipped, pending, tasks, owners } = planTasks(options);
    /** @type {string[]} */
    const ran = [];
    print(
        `${plan.arms.length} arms: ${skipped.length} reused, ${Object.keys(pending).length} to run (${tasks.length} seeds, ${workers} workers)`,
    );
    const onResult = (/** @type {number} */ index, /** @type {any} */ result) => {
        const { arm, slot } = owners[index];
        pending[arm].results[slot] = result;
        pending[arm].left -= 1;
        if (pending[arm].left === 0) {
            reports[arm] = writeArmReport({ name: arm, pending: pending[arm], ticks: plan.ticks, sha, outDir });
            ran.push(arm);
            print(`arm ${arm} done`);
        }
    };
    if (tasks.length > 0) {
        await runPool(tasks, { workerUrl: WORKER_URL, workers, onResult });
    }
    const ordered = Object.fromEntries(plan.arms.map((arm) => [arm.name, reports[arm.name]]));
    return { reports: ordered, ran, skipped };
}
