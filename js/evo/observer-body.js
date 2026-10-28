// The observer's body counters: per slot, the size and vision traits and the diversity niche, written when the agent
// is born and read at its death. The sim frees a dead agent's slot (and a newborn may fill it) before the observer
// scores the death, so the traits cannot be read from the world then. `fitnessV6` reads `observer.niche` for the
// diversity factor and the death log's `bodyPlan` for the descriptor.

import { nicheOf } from './fitness-v6-diversity.js';

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
    observer.niche[slot] = nicheOf(observer.spec[slot], size, observer.config.traitsEnabled);
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
    const held = world.config.traitsEnabled && world.genomeId[slot] === genomeId;
    noteBody(observer, slot, held ? world.baseSize[slot] / world.config.baseSize : 1, held ? world.vision[slot] : 1);
}
