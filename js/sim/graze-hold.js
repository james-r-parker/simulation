// The graze hold (eat-choice.md, Phase 4): a forager that reaches food by a deliberate approach and then grazes in place
// stops closing on the food, so `isDeliberate` alone scores its later bites as chance. The hold carries the verdict
// through the same contact: after a deliberate meal, a meal is deliberate while the eater has held `BITE` above 0 on
// every tick since and its last held meal is at most `HOLD_WINDOW` ticks back. Releasing `BITE`, or going
// `HOLD_WINDOW` ticks without a meal, ends the contact. The sim's merit and the observer's intent state share these
// functions over their own `hold` arrays. Nothing here allocates or draws randomness.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { INTENT_WINDOW, isDeliberate } from './merit-state.js';

/** Ticks a hold lasts without a meal. */
export const HOLD_WINDOW = INTENT_WINDOW;

const NEVER = -Infinity;

/**
 * Ends the slot's hold when it does not hold `BITE` above 0 this tick. Call once per tick per alive slot, after its
 * outputs are final and before its meals are credited.
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @param {Float64Array} hold the tick of each slot's last held meal
 * @returns {void}
 */
export function trackHold(world, slot, hold) {
    if (world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] <= 0) {
        hold[slot] = NEVER;
    }
}

/**
 * Judges a meal and renews the hold when the meal is deliberate.
 * @param {Record<string, any>} kind the food target view, with its `hold` array
 * @param {number} slot the eater
 * @param {number} tick the meal's tick
 * @returns {boolean} whether the meal is deliberate: `isDeliberate`, or within a live hold
 */
export function heldMealDeliberate(kind, slot, tick) {
    const deliberate = tick - kind.hold[slot] <= HOLD_WINDOW || isDeliberate(kind, slot, tick);
    if (deliberate) {
        kind.hold[slot] = tick;
    }
    return deliberate;
}
