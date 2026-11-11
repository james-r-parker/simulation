// What a compare row needs before it may carry a verdict: the metric's status. Pure.

import { METRICS } from './metric-registry/index.js';
import { metricStatus } from './metric-registry/status.js';

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
