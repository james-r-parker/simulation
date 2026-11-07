// Fills every alive agent's inputs row: ray block, then the body and scent inputs.

import { writeBodyInputs } from './body-inputs.js';
import { COS_H, SIN_H, castSlot } from './ray-march.js';
import { writeScentInputs } from './scent-inputs.js';
import { syncSense } from './wasm-sense.js';

/**
 * Senses for all alive agents in ascending slot order.
 * @param {import('./world.js').World} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built for this tick
 * @returns {void}
 */
export function senseAll(world, hash) {
    const { alive } = world;
    syncSense(world, hash);
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            castSlot(world, slot);
            const cH = world.rayScratch[COS_H];
            const sH = world.rayScratch[SIN_H];
            writeBodyInputs(world, slot, cH, sH);
            writeScentInputs(world, slot, cH, sH);
        }
    }
}
