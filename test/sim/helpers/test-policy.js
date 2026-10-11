// Minimal brain policies for tests: zero weights, with or without a fixed specialisation.

/**
 * A policy that leaves the weights at zero and has no `initSpec`, so `spawn` draws the specialisation.
 * @type {import('../../../js/sim/spawn.js').Policy}
 */
export const testPolicy = {
    initBrain() {},
};

/**
 * Builds a zero-weight policy whose `initSpec` always returns `spec`.
 * @param {number} spec the specialisation index to assign
 * @returns {import('../../../js/sim/spawn.js').Policy}
 */
export function fixedSpecPolicy(spec) {
    return {
        initSpec: () => spec,
        initBrain() {},
    };
}
