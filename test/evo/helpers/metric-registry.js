// Registry reads for producer tests: a metric's direction and intended direction, and the names a module produces.

import { METRICS } from '../../../js/evo/metric-registry/index.js';

/**
 * @param {string} name a registered metric name
 * @returns {'higher' | 'lower' | 'watch'} its registry `direction`
 */
export function directionOf(name) {
    return METRICS[/** @type {keyof typeof METRICS} */ (name)].direction;
}

/**
 * @param {string} name a registered `watch` metric name
 * @returns {string | undefined} its registry `intended` direction
 */
export function intendedOf(name) {
    return /** @type {{intended?: string}} */ (METRICS[/** @type {keyof typeof METRICS} */ (name)]).intended;
}

/**
 * @param {string} module a repo path such as `js/evo/scene-bite.js`
 * @returns {string[]} the sorted names of the registry entries whose `module` is that file
 */
export function namesOf(module) {
    return Object.entries(METRICS)
        .filter(([, entry]) => entry.module === module)
        .map(([name]) => name)
        .sort();
}

/**
 * Views a typed metric record as one keyed by any string, for a test that builds the name at run time.
 * @param {import('../../../js/evo/metrics-stats.js').MetricRecord} metrics a producer's result
 * @returns {Record<string, import('../../../js/evo/metrics-stats.js').MetricResult>} the same object
 */
export function loose(metrics) {
    return /** @type {Record<string, import('../../../js/evo/metrics-stats.js').MetricResult>} */ (metrics);
}

/**
 * @param {import('../../../js/evo/metrics-stats.js').MetricRecord} metrics a producer's result
 * @param {import('../../../js/evo/metric-registry/index.js').MetricName} name a registered name
 * @returns {import('../../../js/evo/metrics-stats.js').MetricResult} the producer's result under `name`
 * @throws {Error} when the producer returned nothing under that name
 */
export function resultOf(metrics, name) {
    const result = metrics[name];
    if (result === undefined) {
        throw new Error(`no result for ${name}`);
    }
    return result;
}
