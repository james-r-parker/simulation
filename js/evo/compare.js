// Compare two eval reports: paired BCa bootstrap intervals and verdicts. Pure: no clock, no files, seeded randomness.

import { configHash } from '../sim/config.js';
import { detExp, detLog } from '../sim/det-math.js';
import { createRng, fork, nextInt } from '../sim/rng.js';

export const RESAMPLES = 10000;
export const MIN_SEEDS = 16;
export const MIN_EFFECT = 0.05;
const BOOTSTRAP_SEED = 1;

/** Metric directions by exact name; the families below cover the parameterised names. */
const DIRECTIONS = {
    'eval.food_energy_per_1k': 'higher',
    'eval.median_lifespan': 'higher',
    'eval.fed_median_lifespan': 'higher',
    'eval.births_per_1k': 'higher',
    'eval.population_mean': 'watch',
    'eval.floor_episodes': 'lower',
    'eval.born_share': 'watch',
    'eval.predation_per_1k': 'watch',
    'eval.diversity': 'higher',
    'eval.lineages_alive': 'higher',
    'eval.lineage_turnover': 'higher',
    'eval.behaviour_coverage': 'higher',
    'eval.motion_coverage': 'watch',
    'eval.predator_share_cv': 'watch',
    'eval.qd_score': 'higher',
    'eval.coverage': 'higher',
    'eval.champion_elo': 'watch',
    'eval.champion_win_rate': 'watch',
    'eval.catch_rate': 'higher',
    'eval.escape_rate': 'higher',
    'eval.pack_kill_share': 'higher',
    'eval.alarm_response': 'higher',
    'eval.smoke_escapes': 'higher',
    'eval.deliberate_food_share': 'higher',
    'eval.pursuit_bite_share': 'higher',
    'eval.pursuit_kill_share': 'higher',
    'eval.pack_convergence': 'higher',
    'eval.hunt_call_answer': 'higher',
    'eval.evasion_skill': 'higher',
    'eval.group_cohesion_under_threat': 'higher',
    'eval.alarm_precision': 'higher',
    'eval.hunt_call_precision': 'higher',
    'eval.smoke_precision': 'higher',
    'eval.idle_signals_per_1k': 'lower',
    'eval.undefended_bite_share': 'lower',
    'eval.unseen_bite_share': 'watch',
    'eval.offspring_per_life': 'watch',
    'eval.generation_depth_p90': 'watch',
    'eval.opportunity_for_selection': 'watch',
    'eval.fitness_lrs_corr': 'watch',
    'eval.archive_lineage_share': 'watch',
    'eval.kin_within_call_radius': 'watch',
    'browser.frame_p95_ms': 'lower',
    'browser.main_long_tasks': 'lower',
    'browser.gc_pause_ms': 'lower',
};
const FITNESS_PREFIXES = ['eval.p90_fitness.', 'eval.mean_fitness.'];

/**
 * @param {string} metric a metric name
 * @returns {'higher' | 'lower' | 'watch' | null} the direction that counts as better, or null for an unknown name
 */
export function metricDirection(metric) {
    if (Object.hasOwn(DIRECTIONS, metric)) {
        return /** @type {'higher' | 'lower' | 'watch'} */ (
            DIRECTIONS[/** @type {keyof typeof DIRECTIONS} */ (metric)]
        );
    }
    if (FITNESS_PREFIXES.some((prefix) => metric.startsWith(prefix))) {
        return 'higher';
    }
    return metric.startsWith('bench.') ? 'lower' : null;
}

/**
 * Standard normal CDF (Hart's rational approximation as given by West 2005; absolute error about 1e-15).
 * @param {number} x a value
 * @returns {number} P(Z <= x)
 */
export function normalCdf(x) {
    const a = Math.abs(x);
    if (a > 37) {
        return x > 0 ? 1 : 0;
    }
    const e = detExp(-a * a * 0.5);
    let tail;
    if (a < 7.07106781186547) {
        let num = 3.52624965998911e-2 * a + 0.700383064443688;
        for (const c of [6.37396220353165, 33.912866078383, 112.079291497871, 221.213596169931, 220.206867912376]) {
            num = num * a + c;
        }
        let den = 8.83883476483184e-2 * a + 1.75566716318264;
        for (const c of [16.064177579207, 86.7807322029461, 296.564248779674, 637.333633378831, 793.826512519948]) {
            den = den * a + c;
        }
        tail = (e * num) / (den * a + 440.413735824752);
    } else {
        let build = a + 0.65;
        for (const k of [4, 3, 2, 1]) {
            build = a + k / build;
        }
        tail = e / build / 2.506628274631;
    }
    return x > 0 ? 1 - tail : tail;
}

const ACKLAM_A = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
];
const ACKLAM_B = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
const ACKLAM_C = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
];
const ACKLAM_D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
const ACKLAM_LOW = 0.02425;

/**
 * @param {number[]} coeffs polynomial coefficients, highest degree first
 * @param {number} x the argument
 * @returns {number} the polynomial at x
 */
function horner(coeffs, x) {
    return coeffs.reduce((acc, c) => acc * x + c);
}

/**
 * @param {number} p a probability in (0, 1)
 * @returns {number} Acklam's rational approximation of the quantile (relative error about 1e-9)
 */
function acklam(p) {
    if (p < ACKLAM_LOW || p > 1 - ACKLAM_LOW) {
        const q = Math.sqrt(-2 * detLog(p < 0.5 ? p : 1 - p));
        const z = horner(ACKLAM_C, q) / (horner(ACKLAM_D, q) * q + 1);
        return p < 0.5 ? z : -z;
    }
    const q = p - 0.5;
    const r = q * q;
    return (horner(ACKLAM_A, r) * q) / (horner(ACKLAM_B, r) * r + 1);
}

/**
 * Inverse of the standard normal CDF: Acklam's approximation, refined by one Halley step against `normalCdf`.
 * @param {number} p a probability in (0, 1)
 * @returns {number} z with P(Z <= z) = p
 * @throws {Error} when p is outside (0, 1)
 */
export function normalQuantile(p) {
    if (!(p > 0 && p < 1)) {
        throw new Error(`normalQuantile: p must be in (0, 1), got ${p}`);
    }
    const z = acklam(p);
    const err = normalCdf(z) - p;
    const u = (err * 2.506628274631) / detExp(-z * z * 0.5);
    return z - u / (1 + (z * u) / 2);
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
 * BCa bootstrap confidence interval of the mean. Bias correction z0 is the normal quantile of the share of bootstrap
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
    const means = bootstrapMeans(values, fork(createRng(BOOTSTRAP_SEED), 'bootstrap'));
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
 * A verdict needs the interval to exclude 0 and the mean difference to be at least `minEffect` of the reference.
 * @param {'higher' | 'lower'} direction the better direction
 * @param {{ low: number, high: number, diff: number, ref: number, minEffect: number }} stats interval, mean paired
 *   difference, reference magnitude and minimum relative effect
 * @returns {'better' | 'worse' | 'no-difference'} the verdict
 */
function verdictFor(direction, { low, high, diff, ref, minEffect }) {
    const up = low > 0;
    const down = high < 0;
    if ((!up && !down) || ref === 0 || Math.abs(diff) < minEffect * ref) {
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
 * @property {'better' | 'worse' | 'no-difference' | '-'} verdict the verdict
 * @property {string} [note] why the verdict is `-`, when it is not simply a watch metric
 */

/**
 * @param {string} metric the metric name
 * @param {Record<string, any>} before the before report
 * @param {Record<string, any>} after the after report
 * @param {{ level: number, minEffect: number }} options the confidence level and the minimum relative effect for a verdict
 * @returns {CompareRow} the row
 */
function compareMetric(metric, before, after, { level, minEffect }) {
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
    };
    const direction = metricDirection(metric);
    const fitness = FITNESS_PREFIXES.some((prefix) => metric.startsWith(prefix));
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
    if (direction === null) {
        return { ...filled, note: 'unknown metric' };
    }
    return direction === 'watch'
        ? filled
        : { ...filled, verdict: verdictFor(direction, { low, high, diff, ref, minEffect }) };
}

/**
 * Compares two reports run on the same seeds, ticks and (up to `allowConfigDiff`) config. Different policies are fine.
 * @param {Record<string, any>} before the before report
 * @param {Record<string, any>} after the after report
 * @param {{ level?: number, minEffect?: number, allowConfigDiff?: string[], allowSeedDiff?: boolean }} [options] the
 *   interval level (0.95), the minimum relative effect for a verdict (`MIN_EFFECT`), config keys allowed to differ, and whether different seed lists (of equal length) may be paired by
 *   position - for the calibration experiment, where the two arms are independent samples, not paired by seed
 * @returns {{ level: number, minEffect: number, paired: boolean, seedCount: number, seeds: number[], rows: CompareRow[] }}
 *   `paired` is true when the arms share seeds; one row per metric present in both reports, sorted by name
 * @throws {Error} with `field` set when the reports cannot be compared
 */
export function compareReports(
    before,
    after,
    { level = 0.95, minEffect = MIN_EFFECT, allowConfigDiff = [], allowSeedDiff = false } = {},
) {
    checkComparable(before, after, { allowConfigDiff, allowSeedDiff });
    const names = Object.keys(before.metrics)
        .filter((name) => Object.hasOwn(after.metrics, name))
        .sort();
    const paired = before.seeds.every((/** @type {number} */ seed, /** @type {number} */ i) => seed === after.seeds[i]);
    return {
        level,
        minEffect,
        paired,
        seedCount: before.seeds.length,
        seeds: [...before.seeds],
        rows: names.map((name) => compareMetric(name, before, after, { level, minEffect })),
    };
}
