// Agent sex: a 0 or 1 per slot drawn from the `lifecycle` stream at every entry.

import { nextFloat } from './rng.js';

/** Sex codes stored in `world.sex`. */
export const SEX = Object.freeze({ FEMALE: 0, MALE: 1 });

/**
 * Draws the slot's sex 50/50 from the `lifecycle` stream.
 * @param {Record<string, any>} world the world
 * @param {number} slot the newly entered slot
 * @returns {void}
 */
export function drawSex(world, slot) {
    world.sex[slot] = nextFloat(world.rng.lifecycle) < 0.5 ? SEX.FEMALE : SEX.MALE;
}
