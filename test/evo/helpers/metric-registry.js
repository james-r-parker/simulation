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
