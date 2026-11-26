// Compare two eval reports: paired BCa bootstrap intervals and verdicts. Pure: no clock, no files, seeded randomness.

import { configHash } from '../sim/config.js';
import { pooledDiff, pooledInterval } from './compare-pooled.js';
import { normalCdf, normalQuantile } from './normal.js';
import { createRng, fork, nextInt } from '../sim/rng.js';
import { STUDENTISED_BELOW, studentisedInterval } from './bootstrap-t.js';
import { DEFAULT_MIN_SEEDS, METRICS, minSeedsFor } from './metric-registry/index.js';
import { withCurrentNames } from './metric-registry/renames.js';
import { effectFloor, SHARE_MIN_EFFECT, SIGN_ALPHA, sparseSignP, statusOf } from './compare-rules.js';

export { normalCdf, normalQuantile };

/** @typedef {import('./metric-registry/index.js').MetricName} MetricName */

export const RESAMPLES = 10000;
export const MIN_SEEDS = DEFAULT_MIN_SEEDS;
export const MIN_EFFECT = 0.05;
const BOOTSTRAP_SEED = 1;

const FITNESS_PREFIXES = ['eval.p90_fitness.', 'eval.mean_fitness.'];

/** @type {Record<string, 'higher' | 'lower'>} browser-run metrics, which are not eval metrics and have no registry entry */
const BROWSER_DIRECTIONS = {
    'browser.frame_p95_ms': 'lower',
    'browser.main_long_tasks': 'lower',
    'browser.gc_pause_ms': 'lower',
};

/**
 * @param {string} metric a metric name
 * @returns {'higher' | 'lower' | 'watch' | null} the direction that counts as better (the registry's `direction`, else a
 *   fitness-prefixed, browser or `bench.` metric's), or null for an unknown name
 */
export function metricDirection(metric) {
    if (Object.hasOwn(METRICS, metric)) {
        return METRICS[/** @type {MetricName} */ (metric)].direction;
    }
    if (Object.hasOwn(BROWSER_DIRECTIONS, metric)) {
        return BROWSER_DIRECTIONS[metric];
    }
    if (FITNESS_PREFIXES.some((prefix) => metric.startsWith(prefix))) {
        return 'higher';
    }
    return metric.startsWith('bench.') ? 'lower' : null;
}

/**
 * @param {readonly number[]} values the sample
 * @returns {number} the mean
 */
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Jackknife acceleration: skewness of the leave-one-out means.
 * @param {readonly number[]} values the sample
 * @returns {number} the acceleration, 0 when the leave-one-out means are all equal
 */
function acceleration(values) {
    const n = values.length;
    const total = values.reduce((sum, v) => sum + v, 0);
    const loo = values.map((v) => (total - v) / (n - 1));
    const centre = mean(loo);
    let squares = 0;
    let cubes = 0;
    for (const m of loo) {
        squares += (centre - m) * (centre - m);
        cubes += (centre - m) * (centre - m) * (centre - m);
    }
    return squares === 0 ? 0 : cubes / (6 * squares * Math.sqrt(squares));
}

/**
 * @param {readonly number[]} values the sample
 * @param {import('../sim/rng.js').Rng} rng the stream to draw resample indices from
 * @returns {Float64Array} the means of `RESAMPLES` resamples with replacement, sorted ascending
 */
function bootstrapMeans(values, rng) {
    const n = values.length;
    const means = new Float64Array(RESAMPLES);
    for (let b = 0; b < RESAMPLES; b++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += values[nextInt(rng, n)];
        }
        means[b] = sum / n;
    }
    return means.sort();
}

/**
 * Bootstrap confidence interval of the mean: studentised under `STUDENTISED_BELOW` (32) values, where BCa under-covers (D4),
 * BCa from there. BCa: bias correction z0 is the normal quantile of the share of bootstrap
 * means below the observed mean (clamped to half a resample from 0 and 1); acceleration comes from the jackknife.
 * Equal values give [v, v] without drawing. Each call forks `createRng(1)` as `bootstrap`, so a metric's interval does
 * not depend on which other metrics are compared.
 * @param {readonly number[]} values the sample (here the paired per-seed differences)
 * @param {number} [level] the confidence level
 * @returns {{ low: number, high: number }} the interval
 * @throws {Error} on fewer than 2 values or a level outside (0, 1)
 */
export function bootstrapInterval(values, level = 0.95) {
    if (values.length < 2 || !(level > 0 && level < 1)) {
        throw new Error('bootstrapInterval: need at least 2 values and a level in (0, 1)');
    }
    const observed = mean(values);
    if (values.every((v) => v === values[0])) {
        return { low: values[0], high: values[0] };
    }
    const rng = fork(createRng(BOOTSTRAP_SEED), 'bootstrap');
    if (values.length < STUDENTISED_BELOW) {
        return studentisedInterval(values, { rng, resamples: RESAMPLES, level });
    }
    const means = bootstrapMeans(values, rng);
    let below = 0;
    while (below < RESAMPLES && means[below] < observed) {
        below++;
    }
    const share = Math.min(1 - 0.5 / RESAMPLES, Math.max(0.5 / RESAMPLES, below / RESAMPLES));
    const z0 = normalQuantile(share);
    const a = acceleration(values);
    const adjust = (/** @type {number} */ z) => normalCdf(z0 + (z0 + z) / (1 - a * (z0 + z)));
    const pick = (/** @type {number} */ p) => means[Math.min(RESAMPLES - 1, Math.max(0, Math.floor(p * RESAMPLES)))];
    const tail = (1 - level) / 2;
    return { low: pick(adjust(normalQuantile(tail))), high: pick(adjust(normalQuantile(1 - tail))) };
}

/**
 * @param {string} field the mismatched field
 * @param {string} reason why the reports cannot be compared
 * @returns {Error} an error carrying `field`
 */
function refusal(field, reason) {
    return Object.assign(new Error(reason), { field });
}

/**
 * @param {Record<string, any>} config a report config
 * @param {readonly string[]} skip the keys to drop
 * @returns {string} the config hash without those keys
 */
function reducedHash(config, skip) {
    return configHash(Object.fromEntries(Object.entries(config).filter(([key]) => !skip.includes(key))));
}

/**
 * @param {Record<string, any>} before the before report
 * @param {Record<string, any>} after the after report
 * @param {{ allowConfigDiff: string[], allowSeedDiff: boolean }} allow what may differ
 * @returns {void}
 * @throws {Error} with `field` 'seeds', 'seedCount', 'ticks' or 'config' when the reports are not comparable
 */
function checkComparable(before, after, { allowConfigDiff, allowSeedDiff }) {
    const sameCount = before.seeds.length === after.seeds.length;
    const sameSeeds =
        sameCount && before.seeds.every((/** @type {number} */ s, /** @type {number} */ i) => s === after.seeds[i]);
    if (!sameSeeds && !(allowSeedDiff && sameCount)) {
        throw refusal('seeds', `seeds differ: [${before.seeds}] vs [${after.seeds}]`);
    }
    if (before.seeds.length < MIN_SEEDS) {
        throw refusal('seedCount', `need at least ${MIN_SEEDS} seeds, got ${before.seeds.length}`);
    }
    if (before.ticks !== after.ticks) {
        throw refusal('ticks', `ticks differ: ${before.ticks} vs ${after.ticks}`);
    }
    if (reducedHash(before.config, allowConfigDiff) !== reducedHash(after.config, allowConfigDiff)) {
        const keys = new Set([...Object.keys(before.config), ...Object.keys(after.config)]);
        const differing = [...keys].filter(
            (k) =>
                !allowConfigDiff.includes(k) &&
                configHash({ k: before.config[k] }) !== configHash({ k: after.config[k] }),
        );
        throw refusal('config', `configs differ in: ${differing.sort().join(', ')}`);
    }
}

/**
 * @param {number | null} beforeMean the before mean
 * @param {number | null} afterMean the after mean
 * @returns {number} |before mean|, or |after mean| when that is 0 (0 when both are)
 */
function reference(beforeMean, afterMean) {
    // Rows with a null seed value return before this, so a null mean only arises with no values; Number(null) is 0.
    return Math.abs(Number(beforeMean)) || Math.abs(Number(afterMean));
}

/**
 * A verdict needs the interval to exclude 0 and the mean difference to be at least the metric's effect floor
 * (`effectFloor`: a relative share of the reference, or an absolute step for a share).
 * @param {'higher' | 'lower'} direction the better direction
 * @param {{ low: number, high: number, diff: number, ref: number, floor: number }} stats interval, mean paired
 *   difference, reference magnitude and the smallest absolute difference that counts
 * @returns {'better' | 'worse' | 'no-difference'} the verdict
 */
function verdictFor(direction, { low, high, diff, ref, floor }) {
    const up = low > 0;
    const down = high < 0;
    if ((!up && !down) || ref === 0 || Math.abs(diff) < floor) {
        return 'no-difference';
    }
    return up === (direction === 'higher') ? 'better' : 'worse';
}

/**
 * @typedef {object} CompareRow
 * @property {string} metric the metric name
 * @property {number | null} before mean in the before report
 * @property {number | null} after mean in the after report
 * @property {number | null} diff mean of the paired differences, null when not comparable
 * @property {number | null} effect diff relative to the reference (|before mean|, else |after mean|); null when
 *   there is no diff or both means are 0
 * @property {number | null} low interval low
 * @property {number | null} high interval high
 * @property {'better' | 'worse' | 'no-difference' | 'unverified' | '-'} verdict the verdict; `unverified` for a registry
 *   metric that is not `verified` (the numbers are kept, no judgement is made)
 * @property {number} minSeeds the seeds a verdict on this metric needs (`minSeedsFor`)
 * @property {string} [note] why the verdict is `-`, when it is not simply a watch metric
 */

/**
 * @param {CompareRow} filled the row with its numbers
 * @param {{ direction: ReturnType<typeof metricDirection>, options: { status: (metric: string) => string,
 *   log?: { log: (level: string, event: string, fields: object) => void } },
 *   stats: { low: number, high: number, diff: number, ref: number, floor: number }, diffs: number[] | null }} context the
 *   metric's direction, the status and log options, the stats `verdictFor` reads and the paired differences (null for a
 *   pooled metric, whose seeds carry no difference of their own, so the sparse sign test does not apply)
 * @returns {CompareRow} the row with its verdict: none for a `watch` metric, `unverified` (and a `CompareUnverified`
 *   record) for a metric that is not `verified`, a note for an unknown one
 */
function withVerdict(filled, { direction, options, stats, diffs }) {
    if (direction === null) {
        return { ...filled, note: 'unknown metric' };
    }
    if (direction === 'watch') {
        return filled;
    }
    const status = options.status(filled.metric);
    if (status !== 'verified') {
        options.log?.log('info', 'CompareUnverified', { metric: filled.metric, status });
        return { ...filled, verdict: 'unverified' };
    }
    const verdict = verdictFor(direction, stats);
    const p = verdict === 'no-difference' || diffs === null ? null : sparseSignP(diffs);
    if (p !== null && p >= SIGN_ALPHA) {
        return { ...filled, verdict: 'no-difference', note: `sparse: sign p ${Number(p.toPrecision(2))}` };
    }
    return { ...filled, verdict };
}

/**
 * A pooled metric (`report-pooled.js`): each arm is the ratio of sums of its seeds' `{num, den}`, and the interval
 * resamples whole seeds. A seed with no opportunities is zero exposure, not a null that blocks the comparison; an arm
 * with none in any seed stays null.
 * @param {{ row: CompareRow, b: Record<string, any>, a: Record<string, any> }} read the row so far and the two
 *   reports' metric entries
 * @param {{ direction: ReturnType<typeof metricDirection>, level: number,
 *   floors: { minEffect: number, shareMinEffect: number }, options: Record<string, any> }} context what `compareMetric` read
 * @returns {CompareRow} the row
 */
function comparePooled({ row, b, a }, { direction, level, floors, options }) {
    if (b.pooled === undefined || a.pooled === undefined) {
        return { ...row, note: 'pooled in one report only' };
    }
    const diff = pooledDiff(b.pooled, a.pooled, b.pooled.keys());
    if (diff === null) {
        return { ...row, before: b.mean, after: a.mean, note: 'no opportunities in an arm' };
    }
    const { low, high } = pooledInterval(b.pooled, a.pooled, { level, resamples: RESAMPLES });
    const ref = reference(b.mean, a.mean);
    const filled = { ...row, diff, effect: ref === 0 ? null : diff / ref, low, high };
    return withVerdict(filled, {
        direction,
        options: /** @type {any} */ (options),
        diffs: null,
        stats: { low, high, diff, ref, floor: effectFloor(row.metric, ref, floors) },
    });
}

/**
 * @param {string} metric the metric name
 * @param {Record<string, any>} before the before report
 * @param {Record<string, any>} after the after report
 * @param {{ level: number, floors: { minEffect: number, shareMinEffect: number },
 *   direction: (metric: string) => ReturnType<typeof metricDirection>, minSeedsFor: (metric: string) => number,
 *   status: (metric: string) => string, log?: { log: (level: string, event: string, fields: object) => void } }} options
 *   the confidence level, the effect floors, the direction, seed minimum and status lookups, and the log
 * @returns {CompareRow} the row
 */
function compareMetric(metric, before, after, options) {
    const { level, floors, direction: directionOf, minSeedsFor: seedsFor } = options;
    const b = before.metrics[metric];
    const a = after.metrics[metric];
    const row = {
        metric,
        before: b.mean,
        after: a.mean,
        diff: null,
        effect: null,
        low: null,
        high: null,
        verdict: /** @type {CompareRow['verdict']} */ ('-'),
        minSeeds: seedsFor(metric),
    };
    if (before.seeds.length < row.minSeeds) {
        return { ...row, note: `needs ${row.minSeeds} seeds` };
    }
    const direction = directionOf(metric);
    const fitness = FITNESS_PREFIXES.some((prefix) => metric.startsWith(prefix));
    if (b.pooled !== undefined || a.pooled !== undefined) {
        return comparePooled({ row, b, a }, { direction, level, floors, options });
    }
    if (b.values.includes(null) || a.values.includes(null)) {
        return { ...row, note: 'null in a seed' };
    }
    if (fitness && before.fitnessName !== after.fitnessName) {
        return { ...row, note: `fitnessName differs: ${before.fitnessName} vs ${after.fitnessName}` };
    }
    const diffs = a.values.map((/** @type {number} */ v, /** @type {number} */ i) => v - b.values[i]);
    const { low, high } = bootstrapInterval(diffs, level);
    const diff = mean(diffs);
    const ref = reference(b.mean, a.mean);
    const filled = { ...row, diff, effect: ref === 0 ? null : diff / ref, low, high };
    return withVerdict(filled, {
        direction,
        options,
        diffs,
        stats: { low, high, diff, ref, floor: effectFloor(metric, ref, floors) },
    });
}

/**
 * Compares two reports run on the same seeds, ticks and (up to `allowConfigDiff`) config. Different policies are fine.
 * Each report's metrics are read under their current names first (`withCurrentNames`), so an old report pairs with a
 * new one through the registry's `renamedFrom` names.
 * @param {Record<string, any>} beforeReport the before report
 * @param {Record<string, any>} afterReport the after report
 * @param {{ level?: number, minEffect?: number, shareMinEffect?: number, allowConfigDiff?: string[],
 *   allowSeedDiff?: boolean, direction?: (metric: string) => ReturnType<typeof metricDirection>,
 *   minSeedsFor?: (metric: string) => number, status?: (metric: string) => string,
 *   log?: { log: (level: string, event: string, fields: object) => void } }} [options] the
 *   interval level (0.95), the minimum relative effect for a verdict (`MIN_EFFECT`), the absolute minimum effect of a
 *   metric of unit `share` (`SHARE_MIN_EFFECT`; `minEffect` never applies to a share), the status lookup (`statusOf`:
 *   a metric that is not `verified` gets `unverified` and a `CompareUnverified` log record in place of a verdict;
 *   `eval:power` passes `() => 'verified'`, since power is how a metric becomes verified), config keys allowed to differ,
 *   whether different seed lists (of equal length) may be paired by position - for the calibration experiment, where
 *   the two arms are independent samples, not paired by seed - and the direction lookup (`metricDirection`; `eval:power`
 *   overrides it to score a `watch` metric in its intended direction)
 * @returns {{ level: number, minEffect: number, shareMinEffect: number, paired: boolean, seedCount: number, seeds: number[], rows: CompareRow[] }}
 *   `paired` is true when the arms share seeds; one row per metric present in both reports, sorted by name
 * @throws {Error} with `field` set when the reports cannot be compared
 */
export function compareReports(
    beforeReport,
    afterReport,
    {
        level = 0.95,
        minEffect = MIN_EFFECT,
        shareMinEffect = SHARE_MIN_EFFECT,
        status = statusOf,
        log,
        allowConfigDiff = [],
        allowSeedDiff = false,
        direction = metricDirection,
        minSeedsFor: seedsFor = minSeedsFor,
    } = {},
) {
    const before = withCurrentNames(beforeReport);
    const after = withCurrentNames(afterReport);
    checkComparable(before, after, { allowConfigDiff, allowSeedDiff });
    const names = Object.keys(before.metrics)
        .filter((name) => Object.hasOwn(after.metrics, name))
        .sort();
    const paired = before.seeds.every((/** @type {number} */ seed, /** @type {number} */ i) => seed === after.seeds[i]);
    return {
        level,
        minEffect,
        shareMinEffect,
        paired,
        seedCount: before.seeds.length,
        seeds: [...before.seeds],
        rows: names.map((name) =>
            compareMetric(name, before, after, {
                level,
                floors: { minEffect, shareMinEffect },
                direction,
                minSeedsFor: seedsFor,
                status,
                log,
            }),
        ),
    };
}
