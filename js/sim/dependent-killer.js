// Whether a killer was still a dependent when it killed (hunter-learning.md, Detectors): a parent of the killer is alive
// within `PARENT_RANGE`. A kill made beside a feeding parent is not evidence the hunter can hunt alone, so the
// `dependent` bit of `HunterKill` lets `eval.hunter_independent_kill_share` count only kills made away from the parents.
// Kept apart from `hunter-ledger.js` and `merit-state.js` so neither grows. No RNG, no clock, no allocation.

import { slotOfGenome } from './merit-state.js';

/** A parent alive within this centre distance in world units makes a kill a dependent one. */
export const PARENT_RANGE = 120;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the hunter
 * @param {number} parentId a parent's genome id, 0 for none
 * @returns {boolean} whether that parent is alive within `PARENT_RANGE` of the hunter
 */
function parentNear(world, slot, parentId) {
    const parent = slotOfGenome(world, parentId);
    if (parent < 0) {
        return false;
    }
    const dx = world.x[parent] - world.x[slot];
    const dy = world.y[parent] - world.y[slot];
    return dx * dx + dy * dy <= PARENT_RANGE * PARENT_RANGE;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} killer the killer's slot
 * @returns {boolean} whether a parent of the killer is alive within `PARENT_RANGE`
 */
export function isDependentKiller(world, killer) {
    return parentNear(world, killer, world.parentA[killer]) || parentNear(world, killer, world.parentB[killer]);
}
