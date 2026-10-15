// Fills every alive agent's inputs row: ray block, then body inputs.

import { writeBodyInputs } from './body-inputs.js';
import { castRays } from './ray-march.js';

/**
 * Senses for all alive agents in ascending slot order.
 * @param {import('./world.js').World} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built for this tick
 * @returns {void}
 */
export function senseAll(world, hash) {
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            castRays(world, hash, slot);
            writeBodyInputs(world, slot);
        }
    }
}
