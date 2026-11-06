// The state and the plain tests of provisioning (hunter-learning.md T4, T4a), kept apart from `provision.js` so that `world.js` and
// `hunter-ledger.js` can use them without importing `energy.js` (which imports `world.js`): the per-slot `provisionedTick` stamp
// (tick + 1 of the last transfer to a young, 0 for never; derived, outside `worldHash`, zeroed by `freeAgent`), the world's
// totals and young list, whether a killer was still a dependent, and the invariant on the totals. No RNG, no clock.

import { slotOfGenome } from './merit-state.js';

/** A hunter provisioned within this many ticks of a kill is still dependent (hunter-learning.md, Detectors). */
export const INDEPENDENT_TICKS = 1000;

/**
 * @returns {[any, string, number][]} the allocation specs for `allocateWorld`, one element per slot: `provisionedTick`
 */
export function provisionSpecs() {
    return [[Uint32Array, 'provisionedTick', 1]];
}

/**
 * Allocates the world-level provisioning state: the scan's young list (with the last gift's totals) and the two-slot totals (energy handed away, energy
 * received).
 * @param {Record<string, any>} world the world being built
 * @returns {void}
 */
export function allocProvision(world) {
    world.provisionTotals = new Float64Array(2);
    world.provisionYoung = { slots: new Int32Array(world.config.maxAgents), count: 0, moved: 0, fed: 0 };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the hunter
 * @param {number} parentId a parent's genome id, 0 for none
 * @returns {boolean} whether that parent is alive within `provisionRange` of the hunter
 */
function parentNear(world, slot, parentId) {
    const parent = slotOfGenome(world, parentId);
    if (parent < 0) {
        return false;
    }
    const dx = world.x[parent] - world.x[slot];
    const dy = world.y[parent] - world.y[slot];
    return dx * dx + dy * dy <= world.config.provisionRange * world.config.provisionRange;
}

/**
 * Whether a killer was still a dependent when it killed: it was provisioned within `INDEPENDENT_TICKS` ticks, or a parent is
 * alive within `provisionRange`. A kill made beside a feeding parent is not evidence the hunter can hunt alone.
 * @param {Record<string, any>} world the world
 * @param {number} killer the killer's slot
 * @returns {boolean} whether the killer is dependent
 */
export function isDependentKiller(world, killer) {
    const stamp = world.provisionedTick[killer];
    if (stamp > 0 && world.tick + 1 - stamp <= INDEPENDENT_TICKS) {
        return true;
    }
    return parentNear(world, killer, world.parentA[killer]) || parentNear(world, killer, world.parentB[killer]);
}

/**
 * Throws unless the two sides of `provisionTotals` agree and no stamp is from the future.
 * @param {Record<string, any>} world the world
 * @param {(slot: number, value: number, detail: string) => Error} fail builds the invariant error
 * @returns {void}
 */
export function assertProvision(world, fail) {
    const totals = world.provisionTotals;
    if (Math.abs(totals[0] - totals[1]) > 1e-6 * Math.max(1, totals[0])) {
        throw fail(-1, totals[0] - totals[1], 'energy handed away and energy received by provisioning differ');
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.provisionedTick[slot] > world.tick + 1) {
            throw fail(slot, world.provisionedTick[slot], 'a provisioning stamp is from the future');
        }
    }
}
