// The studentised (bootstrap-t) interval of a mean, used at every arm size because the BCa interval it replaced
// under-covers (metric-noise.md D4: 9.3% of null intervals exclude 0 at 16 seeds; D8: worse on skewed data at 32
// and 64). Pure and seeded.

import { nextInt } from '../sim/rng.js';

/**
 * @param {readonly number[]} values the sample
 * @returns {number} its mean
 */
function meanOf(values) {
    let sum = 0;
    for (const v of values) {
        sum += v;
    }
    return sum / values.length;
}

/**
 * @param {readonly number[]} values the sample
 * @param {number} mean its mean
 * @returns {number} the standard error of the mean (sample sd over the root of n)
 */
function standardError(values, mean) {
    let squares = 0;
    for (const v of values) {
        squares += (v - mean) * (v - mean);
    }
    return Math.sqrt(squares / (values.length - 1) / values.length);
}

/**
 * The t statistic of each resample: its mean minus the observed mean, over its own standard error. A resample of
 * one repeated value has no standard error and is left out.
 * @param {readonly number[]} values the sample
 * @param {{ rng: import('../sim/rng.js').Rng, resamples: number }} draw the stream and how many resamples
 * @returns {Float64Array} the statistics, sorted ascending
 */
function studentisedStatistics(values, { rng, resamples }) {
    const n = values.length;
    const observed = meanOf(values);
    const pick = new Array(n);
    const stats = new Float64Array(resamples);
    let count = 0;
    for (let b = 0; b < resamples; b++) {
        for (let i = 0; i < n; i++) {
            pick[i] = values[nextInt(rng, n)];
        }
        const m = meanOf(pick);
        const se = standardError(pick, m);
        if (se > 0) {
            stats[count++] = (m - observed) / se;
        }
    }
    return stats.subarray(0, count).sort();
}

/**
 * @param {readonly number[]} values the sample (here the paired per-seed differences), at least 2, not all equal
 * @param {{ rng: import('../sim/rng.js').Rng, resamples: number, level: number }} options the stream, the number of
 *   resamples and the confidence level
 * @returns {{ low: number, high: number }} the studentised interval: the observed mean less the upper and lower
 *   quantiles of the resample t statistics times the observed standard error
 */
export function studentisedInterval(values, { rng, resamples, level }) {
    const observed = meanOf(values);
    const se = standardError(values, observed);
    const stats = studentisedStatistics(values, { rng, resamples });
    if (stats.length === 0) {
        return { low: observed, high: observed };
    }
    const tail = (1 - level) / 2;
    const at = (/** @type {number} */ p) =>
        stats[Math.min(stats.length - 1, Math.max(0, Math.floor(p * stats.length)))];
    return { low: observed - at(1 - tail) * se, high: observed - at(tail) * se };
}
