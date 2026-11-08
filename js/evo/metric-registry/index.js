// The metric registry: one entry per eval metric, merged from the family files (docs/designs/metric-trust.md).

import { CORE } from './core.js';
import { CORE_2 } from './core-2.js';
import { HUNTERS } from './hunters.js';
import { HUNTERS_2 } from './hunters-2.js';
import { INTENT } from './intent.js';
import { SCENES_ECOLOGY } from './scenes-ecology.js';
import { SCENES_ECOLOGY_2 } from './scenes-ecology-2.js';
import { SCENES_ECOLOGY_3 } from './scenes-ecology-3.js';

/** Every eval metric by full name; each key is a literal in a family file, so `MetricName` is a union. */
export const METRICS = Object.freeze({
    ...CORE,
    ...CORE_2,
    ...HUNTERS,
    ...HUNTERS_2,
    ...INTENT,
    ...SCENES_ECOLOGY,
    ...SCENES_ECOLOGY_2,
    ...SCENES_ECOLOGY_3,
});

/** @typedef {keyof typeof METRICS} MetricName a registered metric name */

/**
 * @param {string} base a registered metric name without its suffix
 * @param {string} suffix the suffix of a parameterised metric (a specialisation, a source, an age band)
 * @returns {MetricName} `${base}.${suffix}`
 * @throws {Error} `unknown metric <name>` when the registry has no entry for the joined name
 */
export function metricName(base, suffix) {
    const name = `${base}.${suffix}`;
    if (!Object.hasOwn(METRICS, name)) {
        throw new Error(`unknown metric ${name}`);
    }
    return /** @type {MetricName} */ (name);
}
