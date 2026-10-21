// Agent sex: a 0 or 1 per slot drawn from the `lifecycle` stream at every entry when `sexesEnabled`.

import { nextFloat } from './rng.js';

/** Sex codes stored in `world.sex`. */
export const SEX = Object.freeze({ FEMALE: 0, MALE: 1 });

/**
 * Draws the slot's sex 50/50 from the `lifecycle` stream. Draws nothing, and leaves the slot female, when
 * `sexesEnabled` is false.
 * @param {Record<string, any>} world the world
 * @param {number} slot the newly entered slot
 * @returns {void}
 */
export function drawSex(world, slot) {
    if (world.config.sexesEnabled) {
        world.sex[slot] = nextFloat(world.rng.lifecycle) < 0.5 ? SEX.FEMALE : SEX.MALE;
    }
}
