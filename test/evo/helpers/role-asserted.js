// The guard of `role-metrics.slow.test.js`: which tagged metrics no role-metrics source asserts by value (docs/designs/metric-noise.md,
// Phase 6, T24). A name that is merely quoted, or checked with `Object.hasOwn`, is not read against a planted scene.

/** A planted outcome: the matcher a value assertion ends in. */
const OUTCOME = String.raw`\)\s*\.(?:toBe|toBeCloseTo|toBeNull|toEqual|toBeGreaterThan|toBeLessThan)\(`;

/**
 * @param {string} text a role-metrics source
 * @param {string} name a metric name
 * @returns {boolean} whether the source asserts `metrics[<name or a constant holding it>].value` against an outcome
 */
function assertsByValue(text, name) {
    const keys = [`'${name}'`];
    for (const [, constant] of text.matchAll(new RegExp(String.raw`const (\w+) = '${name}'`, 'g'))) {
        keys.push(constant);
    }
    return keys.some((key) => {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(String.raw`metrics\[${escaped}\]\.value${OUTCOME}`).test(text);
    });
}

/**
 * @param {string[]} sources the role-metrics test sources
 * @param {readonly string[]} names the tagged metrics
 * @returns {string[]} the names none of the sources asserts the value of
 */
export function unassertedMetrics(sources, names) {
    return names.filter((name) => !sources.some((text) => assertsByValue(text, name)));
}
