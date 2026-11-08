// The metric registry: one entry per eval metric, merged from the family files (docs/designs/metric-trust.md).

import { CORE } from './core.js';
import { CORE_2 } from './core-2.js';

/** Every eval metric by full name; each key is a literal in a family file, so `MetricName` is a union. */
export const METRICS = Object.freeze({
    ...CORE,
    ...CORE_2,
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
