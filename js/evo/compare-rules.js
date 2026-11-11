// What a compare row needs before it may carry a verdict: the metric's status and its minimum effect. Pure.

import { binomialTwoSidedP } from './binomial.js';
import { METRICS } from './metric-registry/index.js';
import { metricStatus } from './metric-registry/status.js';

/** The smallest absolute mean paired difference a verdict on a metric of unit `share` needs (metric-trust T29a). */
export const SHARE_MIN_EFFECT = 0.02;

/**
 * @param {string} metric a metric name
 * @returns {'verified' | 'unverified' | 'deprecated'} the registry's status; a name outside the registry (`bench.`,
 *   `browser.`, fitness-prefixed, unknown) is not gated here, so it reads `verified`
 */
export function statusOf(metric) {
    return Object.hasOwn(METRICS, metric)
        ? metricStatus(METRICS[/** @type {keyof typeof METRICS} */ (metric)])
        : 'verified';
}

/**
 * @param {string} metric a metric name
 * @returns {boolean} whether the registry gives it unit `share`
 */
export function isShare(metric) {
    return Object.hasOwn(METRICS, metric) && METRICS[/** @type {keyof typeof METRICS} */ (metric)].unit === 'share';
}

/**
 * @param {string} metric a metric name
 * @param {number} ref the reference magnitude (|before mean|, else |after mean|)
 * @param {{ minEffect: number, shareMinEffect: number }} floors the relative floor and the absolute share floor
 * @returns {number} the smallest |mean paired difference| that may carry a verdict: `shareMinEffect` for a share (a
 *   share near 1 would otherwise need 0.05 of itself, the size of the share power bar), else `minEffect` of `ref`
 */
export function effectFloor(metric, ref, { minEffect, shareMinEffect }) {
    return isShare(metric) ? shareMinEffect : minEffect * ref;
}

/** The largest sign-test p that lets a sparse metric keep a verdict. */
export const SIGN_ALPHA = 0.05;

/**
 * Sparse paired differences (at least half exactly 0) carry a verdict only when the exact two-sided sign test on the
 * nonzero ones agrees: a BCa interval on a few same-signed differences excludes 0 on 2 seeds of 32 (T29c).
 * @param {readonly number[]} diffs the per-seed paired differences
 * @returns {number | null} the exact sign-test p when at least half the differences are 0, null when they are dense
 */
export function sparseSignP(diffs) {
    const nonzero = diffs.filter((d) => d !== 0);
    if (nonzero.length * 2 > diffs.length) {
        return null;
    }
    return binomialTwoSidedP(nonzero.length, nonzero.filter((d) => d > 0).length);
}

/**
 * A threshold criterion tests one arm against a fixed floor, so power does not apply; it needs the metric's definition
 * checked, not full `verified` status (T31).
 * @param {string} metric a metric name
 * @param {Record<string, any>} [metrics] the registry (`METRICS`)
 * @returns {boolean} whether the registry entry has `tests.arithmetic`, `tests.source` and `liveness` filled; false for
 *   a name outside the registry
 */
export function thresholdReady(metric, metrics = /** @type {Record<string, any>} */ (METRICS)) {
    if (!Object.hasOwn(metrics, metric)) {
        return false;
    }
    const { tests, liveness } = metrics[metric];
    return tests.arithmetic !== '' && tests.source !== '' && liveness !== null;
}
