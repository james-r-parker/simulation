// The observer's body counters: per slot, the size and vision traits and the diversity niche, written when the agent
// is born and read at its death. The sim frees a dead agent's slot (and a newborn may fill it) before the observer
// scores the death, so the traits cannot be read from the world then. `fitnessV6` reads `observer.niche` for the
// diversity factor and the death log's `bodyPlan` for the descriptor.

import { createNicheTally, nicheOf, tallyNiches } from './fitness-v6-diversity.js';

/** The niche tally is rebuilt when the tick divides by this (the eval's checkpoint interval). */
export const NICHE_TALLY_TICKS = 1000;

/**
 * Stores a slot's traits and its niche.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the slot
 * @param {number} size the size trait as a multiple of the default `baseSize`
 * @param {number} vision the vision trait as a multiple of the default
 * @returns {void}
 */
export function noteBody(observer, slot, size, vision) {
    observer.sizeTrait[slot] = size;
    observer.visionTrait[slot] = vision;
    observer.niche[slot] = nicheOf(observer.spec[slot], size);
}

/**
 * Stores a newborn's traits from the world. A slot the world has already given to a later newborn this tick no longer
 * holds the agent, so it gets the default traits.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} slot the newborn's slot
 * @param {number} genomeId the newborn's genome id
 * @returns {void}
 */
export function noteBirthBody(observer, world, slot, genomeId) {
    const held = world.genomeId[slot] === genomeId;
    noteBody(observer, slot, held ? world.baseSize[slot] / world.config.baseSize : 1, held ? world.vision[slot] : 1);
}

/**
 * Rebuilds the niche tally every `NICHE_TALLY_TICKS` ticks, creating it the first time. The tally is the observer's
 * own, not the checkpoint's, so a replay or the app (which never run the eval's checkpoints) diversify the same way.
 * Until the first rebuild `observer.nicheTally` is undefined and the diversity factor is 1.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteNiches(observer, world) {
    if (world.tick % NICHE_TALLY_TICKS === 0) {
        observer.nicheTally ??= createNicheTally();
        tallyNiches(observer.nicheTally, world);
    }
}
