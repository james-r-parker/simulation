// The state of provisioning (realistic-keepers.md T3), kept apart from `provision.js` so that `world.js` and `invariants.js`
// can use it without importing `energy.js` (which imports `world.js`): the world's totals and young list, allocated only while
// `provisionEnabled` is on, and the invariant on the totals. No RNG, no clock.

/**
 * Allocates the world-level provisioning state when the switch is on: the scan's young list (with the last gift's totals) and
 * the two-slot totals (energy handed away, energy received).
 * @param {Record<string, any>} world the world being built
 * @returns {void}
 */
export function allocProvision(world) {
    if (!world.config.provisionEnabled) {
        return;
    }
    world.provisionTotals = new Float64Array(2);
    world.provisionYoung = { slots: new Int32Array(world.config.maxAgents), count: 0, moved: 0, fed: 0 };
}

/**
 * Throws unless the two sides of `provisionTotals` agree. Does nothing while the switch is off.
 * @param {Record<string, any>} world the world
 * @param {(slot: number, value: number, detail: string) => Error} fail builds the invariant error
 * @returns {void}
 */
export function assertProvision(world, fail) {
    const totals = world.provisionTotals;
    if (totals !== undefined && Math.abs(totals[0] - totals[1]) > 1e-6 * Math.max(1, totals[0])) {
        throw fail(-1, totals[0] - totals[1], 'energy handed away and energy received by provisioning differ');
    }
}
