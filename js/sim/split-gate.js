// The extra split gates (fitness-and-selection T48d): a diet-share minimum and a splits-per-life cap; and the clonal
// cap (natural-selection Phase 4): a line may split `splitClonalMax` generations in a row, then it must mate. The counters are per-slot typed arrays that `freeAgent` zeroes, so a
// birth starts at 0; they are derived state and are not in `worldHash`. No RNG, no clock, no allocation.

/** @typedef {import('./world.js').World} World */

/**
 * @returns {[Uint32ArrayConstructor, string, number][]} the allocation specs for `allocateWorld`, one element per slot:
 *   `mealsTotal` and `mealsDeliberate` (meal and bite credits), `splitsDone` (splits this life) and `clonalDepth`
 *   (split births since the line last mated: 0 for a founder or a mated child)
 */
export function splitGateSpecs() {
    return [
        [Uint32Array, 'mealsTotal', 1],
        [Uint32Array, 'mealsDeliberate', 1],
        [Uint32Array, 'splitsDone', 1],
        [Uint32Array, 'clonalDepth', 1],
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
 * Sets a newborn's clonal depth: its mother's plus one for a split, 0 for a mating birth.
 * @param {Record<string, any>} world the world
 * @param {{child: number, mother: number, isMate: boolean}} birth the child, its mother or splitter, and the cause
 * @returns {void}
 */
export function noteClonalBirth(world, { child, mother, isMate }) {
    world.clonalDepth[child] = isMate ? 0 : world.clonalDepth[mother] + 1;
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when `splitDeliberateShareMin`, `splitMaxPerLife` and `splitClonalMax` all let the agent split
 */
export function splitKeysAllow(world, slot) {
    const { splitDeliberateShareMin, splitMaxPerLife, splitClonalMax } = world.config;
    if (splitMaxPerLife > 0 && world.splitsDone[slot] >= splitMaxPerLife) {
        return false;
    }
    if (splitClonalMax > 0 && world.clonalDepth[slot] >= splitClonalMax) {
        return false;
    }
    return (
        splitDeliberateShareMin === 0 ||
        (world.mealsTotal[slot] > 0 && world.mealsDeliberate[slot] >= splitDeliberateShareMin * world.mealsTotal[slot])
    );
}
