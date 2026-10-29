// The extra split gates (fitness-and-selection T48d): a diet-share minimum, a splits-per-life cap and a prey-cannot-split
// switch. Each key is off at its default. They apply only while `meritEnabled` and are bypassed with the count gate when
// the population is below `meritSplitFloorPop`. The counters are per-slot typed arrays that `freeAgent` zeroes, so a
// birth starts at 0; they are derived state and are not in `worldHash`. No RNG, no clock, no allocation.

import { specParams } from './spec-params.js';

/** @typedef {import('./world.js').World} World */

/**
 * @returns {[Uint32ArrayConstructor, string, number][]} the allocation specs for `allocateWorld`, one element per slot:
 *   `mealsTotal` and `mealsDeliberate` (meal and bite credits) and `splitsDone` (splits this life)
 */
export function splitGateSpecs() {
    return [
        [Uint32Array, 'mealsTotal', 1],
        [Uint32Array, 'mealsDeliberate', 1],
        [Uint32Array, 'splitsDone', 1],
    ];
}

/**
 * Counts one credited meal or bite.
 * @param {Record<string, any>} world the world
 * @param {number} slot the eater
 * @param {boolean} deliberate whether the tracker called it deliberate
 * @returns {void}
 */
export function noteMeal(world, slot, deliberate) {
    world.mealsTotal[slot] += 1;
    if (deliberate) {
        world.mealsDeliberate[slot] += 1;
    }
}

/**
 * Counts one split by the slot.
 * @param {Record<string, any>} world the world
 * @param {number} slot the splitter
 * @returns {void}
 */
export function noteSplit(world, slot) {
    world.splitsDone[slot] += 1;
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when `splitDeliberateShareMin`, `splitMaxPerLife` and `preySplit` all let the agent split
 */
export function splitKeysAllow(world, slot) {
    const { splitDeliberateShareMin, splitMaxPerLife, preySplit } = world.config;
    if (!preySplit && !specParams(world.config, world.spec[slot]).canHunt) {
        return false;
    }
    if (splitMaxPerLife > 0 && world.splitsDone[slot] >= splitMaxPerLife) {
        return false;
    }
    return (
        splitDeliberateShareMin === 0 ||
        (world.mealsTotal[slot] > 0 && world.mealsDeliberate[slot] >= splitDeliberateShareMin * world.mealsTotal[slot])
    );
}
