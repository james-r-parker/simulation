// What a compare row needs before it may carry a verdict: the metric's status and its minimum effect. Pure.

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
