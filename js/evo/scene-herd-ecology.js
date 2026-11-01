// Observed ecology outcomes from dung zones and seeded plant patches.

import { EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';

/** Counts current-tick herd seed events after burn-in. @param {Record<string, any>} scene @param {Record<string, any>} world @returns {void} */
export function countSeedlings(scene, world) {
    const { data, count } = world.events;
    for (let offset = 0; offset < count * EVENT_STRIDE; offset += EVENT_STRIDE) {
        if (data[offset] === EVENT_TYPE.HERD_SEEDED && data[offset + 1] > BURN_IN_TICKS) {
            scene.herdSeededPatches++;
        }
    }
}

/** Samples patch-level blob proximity during herd-present and herd-absent checkpoints. @param {Record<string, any>} scene @param {Record<string, any>} world @returns {void} */
export function samplePatchHerdFollowing(scene, world) {
    const blobRadiusSq = world.config.foodPatchRadius * world.config.foodPatchRadius;
    const herdRadius = world.config.foodPatchRadius + 400;
    const herdRadiusSq = herdRadius * herdRadius;
    for (let patch = 0; patch < world.patchAlive.length; patch++) {
        if (world.patchAlive[patch] !== 1) {
            continue;
        }
        const serial = world.patchSerial[patch];
        if (scene.followPatchSerial[patch] !== serial) {
            scene.followPatchSerial[patch] = serial;
            scene.followHerdedBlobs[patch] = 0;
            scene.followBareBlobs[patch] = 0;
            scene.followHerdedTicks[patch] = 0;
            scene.followBareTicks[patch] = 0;
        }
        let herdPresent = false;
        for (let animal = 0; animal < world.herdAlive.length && !herdPresent; animal++) {
            if (world.herdAlive[animal] !== 1) {
                continue;
            }
            const dx = world.herdX[animal] - world.patchX[patch];
            const dy = world.herdY[animal] - world.patchY[patch];
            herdPresent = dx * dx + dy * dy <= herdRadiusSq;
        }
        let blobs = 0;
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] !== 1) {
                continue;
            }
            const dx = world.x[slot] - world.patchX[patch];
            const dy = world.y[slot] - world.patchY[patch];
            blobs += Number(dx * dx + dy * dy <= blobRadiusSq);
        }
        if (herdPresent) {
            scene.followHerdedBlobs[patch] += blobs;
            scene.followHerdedTicks[patch]++;
        } else {
            scene.followBareBlobs[patch] += blobs;
            scene.followBareTicks[patch]++;
        }
    }
}
