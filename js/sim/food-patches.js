// Permanent food patches: placed at world creation, drawn from by food spawns in proportion to their stock, drained
// by the food eaten inside them and regrown logistically. The arrays are empty when `foodPatchCount` is 0.

import { EVENT_TYPE, pushEvent } from './events.js';
import { patchRegrowFactor } from './eras.js';
import { basinPatchX, hasTerrain } from './terrain.js';
import { nextFloat } from './rng.js';

/** The share of `foodPatchCapacity` a patch's stock never falls below, so a patch never dies. */
export const PATCH_FLOOR_SHARE = 0.05;

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./rng.js').Rng} Rng */

/**
 * Fills the patch arrays from the `food` stream: centres inside the world, inset by the radius, and full stock
 * (`foodPatchCapacity`). Pushes `FoodPatchesCreated` when there are patches.
 * @param {World} world the world, with `rng` forked
 * @returns {void}
 */
export function createPatches(world) {
    const { foodPatchCount, foodPatchRadius, foodPatchCapacity, worldWidth, worldHeight } = world.config;
    const rng = world.rng.food;
    for (let i = 0; i < foodPatchCount; i++) {
        const unit = nextFloat(rng);
        world.patchX[i] = hasTerrain(world.config)
            ? basinPatchX(world.config, i, unit)
            : foodPatchRadius + unit * (worldWidth - 2 * foodPatchRadius);
        world.patchY[i] = foodPatchRadius + nextFloat(rng) * (worldHeight - 2 * foodPatchRadius);
        world.patchStock[i] = foodPatchCapacity;
    }
    if (foodPatchCount > 0) {
        const o = pushEvent(world.events, EVENT_TYPE.FOOD_PATCHES_CREATED, world.tick);
        world.events.data[o + 2] = foodPatchCount;
        world.events.data[o + 3] = foodPatchRadius;
    }
}

/**
 * Roulette over the patches by stock, in ascending index; draws one float from `rng`.
 * @param {World} world the world; needs at least one patch
 * @param {Rng} rng the stream to draw from
 * @returns {number} the patch index
 */
export function pickPatch(world, rng) {
    const { patchStock } = world;
    let total = 0;
    for (let i = 0; i < patchStock.length; i++) {
        total += patchStock[i];
    }
    let remaining = nextFloat(rng) * total;
    for (let i = 0; i < patchStock.length; i++) {
        remaining -= patchStock[i];
        if (remaining < 0) {
            return i;
        }
    }
    return patchStock.length - 1;
}

/**
 * Takes `foodPatchDepletion` from the nearest patch whose disc contains the point (lowest index on ties), never
 * below the floor.
 * @param {World} world the world
 * @param {number} x the eaten food's x
 * @param {number} y the eaten food's y
 * @returns {void}
 */
export function depletePatchAt(world, x, y) {
    const { patchX, patchY, patchStock } = world;
    const { foodPatchRadius, foodPatchDepletion, foodPatchCapacity } = world.config;
    let best = -1;
    let bestSq = foodPatchRadius * foodPatchRadius;
    for (let i = 0; i < patchStock.length; i++) {
        const dx = x - patchX[i];
        const dy = y - patchY[i];
        const sq = dx * dx + dy * dy;
        if (sq < bestSq) {
            bestSq = sq;
            best = i;
        }
    }
    if (best >= 0) {
        const floor = PATCH_FLOOR_SHARE * foodPatchCapacity;
        patchStock[best] = Math.max(floor, patchStock[best] - foodPatchDepletion);
    }
}

/**
 * One tick of logistic regrowth: `stock += rate x stock x (1 - stock / capacity)`, clamped to the floor and the capacity.
 * @param {World} world the world
 * @returns {void}
 */
export function regrowPatches(world) {
    const { patchStock } = world;
    const { foodPatchRegrow, foodPatchCapacity } = world.config;
    const floor = PATCH_FLOOR_SHARE * foodPatchCapacity;
    for (let i = 0; i < patchStock.length; i++) {
        const stock = Math.min(foodPatchCapacity, Math.max(floor, patchStock[i]));
        const grown = stock + foodPatchRegrow * patchRegrowFactor(world, i) * stock * (1 - stock / foodPatchCapacity);
        patchStock[i] = Math.min(foodPatchCapacity, grown);
    }
}
