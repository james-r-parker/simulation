// Merit at the cap: when `capBirthsEnabled` is on and fewer free slots remain than candidates
// (pregnancies falling due, or agents ready to split), the slots go to the candidates with the highest merit, ties to
// the lower slot. The candidates sit in the world's preallocated `capSlots` (ascending slot order as collected) with
// their merits in `capKeys`; ranking is a repeated max-pick that swaps the best of the rest into place, so it
// allocates nothing and costs O(candidates) per birth, and only the shortfall branch pays it.
// Merit is read through `meritPeek` (no restamp), so ranking never writes world state.

import { meritPeek } from './merit.js';

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @returns {boolean} true when the cap rules rank candidates by merit
 */
export function meritCapOn(world) {
    return world.config.capBirthsEnabled;
}

/**
 * Fills `capKeys` with the merit of each of the first `count` candidates in `capSlots`.
 * @param {World} world the world
 * @param {number} count the candidates collected
 * @returns {void}
 */
export function stampKeys(world, count) {
    const { capSlots, capKeys } = world;
    for (let i = 0; i < count; i++) {
        capKeys[i] = meritPeek(world, capSlots[i]);
    }
}

/**
 * Puts the best candidate of `capSlots[from, count)` (highest merit, then lower slot) at `from`.
 * @param {World} world the world
 * @param {number} count the candidates collected
 * @param {number} from the rank being filled
 * @returns {number} the slot now at `from`
 */
export function pickBest(world, count, from) {
    const { capSlots, capKeys } = world;
    let best = from;
    for (let i = from + 1; i < count; i++) {
        if (capKeys[i] > capKeys[best] || (capKeys[i] === capKeys[best] && capSlots[i] < capSlots[best])) {
            best = i;
        }
    }
    const slot = capSlots[best];
    const key = capKeys[best];
    capSlots[best] = capSlots[from];
    capKeys[best] = capKeys[from];
    capSlots[from] = slot;
    capKeys[from] = key;
    return slot;
}
