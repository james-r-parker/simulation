// Reads an old report through the registry's `renamedFrom` names (docs/designs/metric-trust.md, Registry): a renamed
// metric keeps its values, so `eval:compare`, `metric:liveness` and `eval:power` map an old report's names to the
// current ones before they look anything up.

import { METRICS } from './index.js';

/** @typedef {Readonly<Record<string, { renamedFrom: readonly string[] }>>} RenameSource */

/**
 * @param {RenameSource} metrics the registry
 * @returns {Map<string, string>} each old name to its current name
 */
export function buildRenames(metrics) {
    /** @type {Map<string, string>} */
    const renames = new Map();
    for (const [current, { renamedFrom }] of Object.entries(metrics)) {
        for (const old of renamedFrom) {
            if (Object.hasOwn(metrics, old)) {
                throw new Error(`${old} is both a current name and an old name`);
            }
            const claimed = renames.get(old);
            if (claimed !== undefined) {
                throw new Error(`${old} is an old name of ${claimed} and ${current}`);
            }
            renames.set(old, current);
        }
    }
    return renames;
}

const REGISTRY_RENAMES = buildRenames(METRICS);

/**
 * @param {RenameSource} metrics the registry
 * @returns {Map<string, string>} its renames, built once for the real registry
 */
function renamesOf(metrics) {
    return metrics === METRICS ? REGISTRY_RENAMES : buildRenames(metrics);
}

/**
 * @param {string} name a metric name, old or current
 * @param {RenameSource} [metrics] the registry
 * @returns {string} its current name; any name the registry does not rename is returned as it is
 */
export function currentName(name, metrics = METRICS) {
    return renamesOf(metrics).get(name) ?? name;
}

/**
 * @param {Record<string, any>} report an eval report
 * @param {RenameSource} [metrics] the registry
 * @returns {Record<string, any>} the report with its metrics under their current names (the same object when none is
 *   old)
 */
export function withCurrentNames(report, metrics = METRICS) {
    const renames = renamesOf(metrics);
    const names = Object.keys(report.metrics);
    if (!names.some((name) => renames.has(name))) {
        return report;
    }
    /** @type {Record<string, any>} */
    const renamed = {};
    for (const name of names) {
        const current = renames.get(name) ?? name;
        if (Object.hasOwn(renamed, current)) {
            throw new Error(`report holds ${current} under two names`);
        }
        renamed[current] = report.metrics[name];
    }
    return { ...report, metrics: renamed };
}
