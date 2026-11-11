// The no-harm test of docs/principles.md ("A mechanism that adds realistic natural behaviour stays"): paired bootstrap
// tests on the share of seeds with hunters alive at the last tick and the share ending under 80 agents, plus every
// verified guard metric. The two seed guards use an exact McNemar test on the discordant seeds (a bootstrap interval
// fails on sparse 0/1 differences); a metric guard is `worse` only when its paired bootstrap interval excludes 0. Pure.

import { binomialTwoSidedP, exactWorse, leastDetectedLoss, wilsonInterval } from './binomial.js';
import { bootstrapInterval, metricDirection } from './compare.js';
import { statusOf } from './compare-rules.js';
import { minSeedsFor } from './metric-registry/index.js';

/** Seeds ending under this many agents count as collapsed. */
export const LOW_POPULATION = 80;
/** The adoption bar's alive share (12 of 16) and the guard metrics beyond the two seed shares. */
export const ADOPTION_ALIVE_SHARE = 0.75;
/** Metrics that guard the world besides the two seed shares; each counts only while `verified` (the hunter-skill guard). */
export const GUARD_METRICS = ['eval.hunter_catches_per_1k'];

/**
 * @typedef {object} Guard
 * @property {string} name `alive`, `under80` or a metric name
 * @property {'worse' | 'no-harm' | 'unchecked'} verdict `worse` only when the interval excludes 0 in the bad direction
 * @property {number | null} diff mean paired difference, after minus before (a share, or the metric's unit)
 * @property {number | null} low interval low (a metric guard's bootstrap interval; null for a seed guard)
 * @property {number | null} high interval high (null for a seed guard)
 * @property {number | null} smallest the smallest loss this guard detects (a metric guard: half the interval's width in
 *   the metric's unit; a seed guard: `smallestSeeds` over the seeds)
 * @property {number | null} smallestSeeds a seed guard's least `harmed` count that its test calls worse, given the
 *   `recovered` count observed; null when none up to the seeds run does
 * @property {number} [harmed] seed guard: seeds that moved to the harmful side (`b` of the McNemar test)
 * @property {number} [recovered] seed guard: seeds that moved back (`c`)
 * @property {number} [p] seed guard: the exact two-sided p of `harmed` against `harmed + recovered`
 * @property {string} [note] why the guard is `unchecked`
 */

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their sum
 */
const sum = (values) => values.reduce((total, v) => total + v, 0);

/**
 * @param {Record<string, any>} report an eval report
 * @returns {number[] | null} per seed 1 when `eval.predators_at_end` is above 0 (hunters alive at the last tick), else 0;
 *   null when the report lacks the metric or a seed has no value
 */
export function aliveFlags(report) {
    const values = report.metrics['eval.predators_at_end']?.values;
    return values === undefined || values.includes(null)
        ? null
        : values.map((/** @type {number} */ v) => (v > 0 ? 1 : 0));
}

/**
 * @param {Record<string, any>} report an eval report
 * @returns {number[] | null} per seed 1 when the end population (the sum of the trace's last `spec` counts) is under 80,
 *   else 0; null when the report has no traces
 */
export function underFlags(report) {
    if (!Array.isArray(report.traces)) {
        return null;
    }
    return report.traces.map((/** @type {any} */ t) => (sum(t.spec) < LOW_POPULATION ? 1 : 0));
}

/**
 * @param {string} name the guard name
 * @param {string} note why it is not checked
 * @returns {Guard} an unchecked guard
 */
const unchecked = (name, note) => ({
    name,
    verdict: 'unchecked',
    diff: null,
    low: null,
    high: null,
    smallest: null,
    smallestSeeds: null,
    note,
});

/**
 * @param {string} name the guard name
 * @param {readonly number[]} diffs the per-seed paired differences, after minus before
 * @param {'higher' | 'lower'} direction the better direction
 * @returns {Guard} the metric guard: `worse` when the bootstrap interval excludes 0 on the bad side
 */
function judge(name, diffs, direction) {
    const { low, high } = bootstrapInterval(diffs);
    const worse = direction === 'higher' ? high < 0 : low > 0;
    return {
        name,
        verdict: worse ? 'worse' : 'no-harm',
        diff: sum(diffs) / diffs.length,
        low,
        high,
        smallest: (high - low) / 2,
        smallestSeeds: null,
    };
}

/**
 * @param {string} name the guard name
 * @param {number[] | null} before per-seed 0/1 flags of the before report
 * @param {number[] | null} after the after report's
 * @param {'higher' | 'lower'} direction `higher` when a 1 is the good outcome (alive), `lower` when it is the bad one
 * @returns {Guard} the seed-share guard: an exact McNemar test on the discordant seeds, `worse` when more seeds moved to
 *   the harmful side than back and the exact two-sided p is below 0.05
 */
function seedGuard(name, before, after, direction) {
    if (before === null || after === null) {
        return unchecked(name, 'the report lacks the values');
    }
    const lost = direction === 'higher' ? [1, 0] : [0, 1];
    const moved = (/** @type {number[]} */ [from, to]) => after.filter((v, i) => before[i] === from && v === to).length;
    const harmed = moved(lost);
    const recovered = moved([lost[1], lost[0]]);
    const smallestSeeds = leastDetectedLoss(recovered, before.length - recovered);
    return {
        name,
        verdict: exactWorse(harmed, recovered) ? 'worse' : 'no-harm',
        diff: (sum(after) - sum(before)) / before.length,
        low: null,
        high: null,
        smallest: smallestSeeds === null ? null : smallestSeeds / before.length,
        smallestSeeds,
        harmed,
        recovered,
        p: binomialTwoSidedP(harmed + recovered, harmed),
    };
}

/**
 * @param {string} metric a guard metric
 * @param {Record<string, any>} before the before report
 * @param {Record<string, any>} after the after report
 * @param {{ status: (metric: string) => string, seedsFor: (metric: string) => number }} lookups the status and seed
 *   minimum lookups
 * @returns {string | null} why the metric cannot guard this pair, null when it can
 */
function skipReason(metric, before, after, { status, seedsFor }) {
    const b = before.metrics[metric]?.values;
    const a = after.metrics[metric]?.values;
    if (b === undefined || a === undefined) {
        return 'the report lacks the metric';
    }
    if (status(metric) !== 'verified') {
        return 'unverified';
    }
    if (before.seeds.length < seedsFor(metric)) {
        return `needs ${seedsFor(metric)} seeds`;
    }
    if (b.includes(null) || a.includes(null)) {
        return 'null in a seed';
    }
    return ['higher', 'lower'].includes(String(metricDirection(metric))) ? null : 'no direction';
}

/**
 * @param {string} metric a guard metric
 * @param {Record<string, any>} before the before report
 * @param {Record<string, any>} after the after report
 * @param {{ status: (metric: string) => string, seedsFor: (metric: string) => number }} lookups the status and seed
 *   minimum lookups
 * @returns {Guard} the metric guard, `unchecked` unless it is verified, has enough seeds and no null seed
 */
function metricGuard(metric, before, after, lookups) {
    const reason = skipReason(metric, before, after, lookups);
    if (reason !== null) {
        return unchecked(metric, reason);
    }
    const b = before.metrics[metric].values;
    const diffs = after.metrics[metric].values.map((/** @type {number} */ v, /** @type {number} */ i) => v - b[i]);
    return judge(metric, diffs, /** @type {'higher' | 'lower'} */ (metricDirection(metric)));
}

/**
 * The adoption bar's counts (12 of 16 alive, no more seeds under 80 than the reference), each with its interval.
 * @param {number[] | null} alive the after report's alive flags
 * @param {{ before: number[] | null, after: number[] | null }} under the under-80 flags of both reports
 * @returns {{ alive: Count | null, under80Before: Count | null, under80After: Count | null, pass: boolean }} the counts
 */
function adoption(alive, under) {
    const alive_ = alive === null ? null : count(alive);
    const before = under.before === null ? null : count(under.before);
    const after = under.after === null ? null : count(under.after);
    const pass =
        alive_ !== null &&
        after !== null &&
        before !== null &&
        alive_.count / alive_.of >= ADOPTION_ALIVE_SHARE &&
        after.count <= before.count;
    return { alive: alive_, under80Before: before, under80After: after, pass };
}

/** @typedef {{ count: number, of: number, low: number, high: number }} Count seeds counted, of how many, and the interval in seeds */

/**
 * @param {readonly number[]} flags 0/1 per seed
 * @returns {Count} the count with the Wilson interval of the share, in seeds
 */
function count(flags) {
    const { low, high } = wilsonInterval(sum(flags), flags.length);
    return { count: sum(flags), of: flags.length, low: low * flags.length, high: high * flags.length };
}

/**
 * Judges whether `after` does harm against `before` on the same seeds.
 * @param {Record<string, any>} before the reference report
 * @param {Record<string, any>} after the arm's report
 * @param {{ guards?: string[], status?: (metric: string) => string, seedsFor?: (metric: string) => number }} [options] the guard metrics
 *   (`GUARD_METRICS`), the status lookup (`statusOf`) and the seed minimum lookup (`minSeedsFor`)
 * @returns {{ worse: boolean, guards: Guard[], adoption: ReturnType<typeof adoption> }} `worse` when any guard is
 *   `worse`; the guards (alive share, under-80 share, each verified guard metric) and the adoption bar's counts
 * @throws {Error} when the seed lists differ or are shorter than 2
 */
export function keepRule(
    before,
    after,
    { guards: names = GUARD_METRICS, status = statusOf, seedsFor = minSeedsFor } = {},
) {
    const same =
        before.seeds.length === after.seeds.length &&
        before.seeds.every((/** @type {number} */ s, /** @type {number} */ i) => s === after.seeds[i]);
    if (!same || before.seeds.length < 2) {
        throw new Error('keepRule needs two reports on the same seeds, at least 2');
    }
    const under = { before: underFlags(before), after: underFlags(after) };
    const guards = [
        seedGuard('alive', aliveFlags(before), aliveFlags(after), 'higher'),
        seedGuard('under80', under.before, under.after, 'lower'),
        ...names.map((metric) => metricGuard(metric, before, after, { status, seedsFor })),
    ];
    return {
        worse: guards.some((g) => g.verdict === 'worse'),
        guards,
        adoption: adoption(aliveFlags(after), under),
    };
}

/**
 * @param {ReturnType<typeof keepRule>} result a keep-rule result
 * @returns {string[]} lines: one per guard with its verdict, interval and smallest detected loss, then the adoption counts
 */
export function formatKeepRule(result) {
    const f = (/** @type {number | null | undefined} */ n) => String(Number(/** @type {number} */ (n).toPrecision(3)));
    const lines = result.guards.map((g) => {
        if (g.verdict === 'unchecked') {
            return `guard ${g.name}: unchecked (${g.note})`;
        }
        if (g.harmed === undefined) {
            return `guard ${g.name}: ${g.verdict}, diff ${f(g.diff)}, interval [${f(g.low)}, ${f(g.high)}], smallest loss detected ${f(g.smallest)}`;
        }
        const least = g.smallestSeeds === null ? 'none' : `${g.smallestSeeds} seeds`;
        return `guard ${g.name}: ${g.verdict}, ${g.harmed} seeds harmed vs ${g.recovered} recovered (exact p ${f(g.p)}), smallest loss detected ${least}`;
    });
    const c = (/** @type {Count | null} */ n) =>
        n === null ? 'n/a' : `${n.count}/${n.of} [${f(n.low)}, ${f(n.high)}]`;
    const { adoption: a } = result;
    lines.push(
        `adoption bar: hunters alive ${c(a.alive)} (need 0.75), seeds under 80: ${c(a.under80After)} vs reference ${c(a.under80Before)}, ${a.pass ? 'met' : 'not met'}`,
        `keep rule: ${result.worse ? 'WORSE' : 'no harm detected at this size'}`,
    );
    return lines;
}
