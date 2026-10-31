// Manages the living patch pool, seasonal source selection and plant stock.

import { assignFlora } from './flora-state.js';
import { refreshFruiting } from './fruiting.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { patchRegrowFactor } from './eras.js';
import { basinPatchX } from './terrain.js';
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
    const { foodPatchCount, foodPatchRadius, foodPatchCapacity, worldHeight } = world.config;
    const rng = world.rng.food;
    for (let i = 0; i < foodPatchCount; i++) {
        const unit = nextFloat(rng);
        world.patchX[i] = basinPatchX(world.config, i, unit);
        world.patchY[i] = foodPatchRadius + nextFloat(rng) * (worldHeight - 2 * foodPatchRadius);
        world.patchStock[i] = foodPatchCapacity;
        world.patchAlive[i] = 1;
        world.patchSerial[i] = 1;
    }
    assignFlora(world);
    refreshFruiting(world);
    if (foodPatchCount > 0) {
        const o = pushEvent(world.events, EVENT_TYPE.FOOD_PATCHES_CREATED, world.tick);
        world.events.data[o + 2] = foodPatchCount;
        world.events.data[o + 3] = foodPatchRadius;
    }
}

/**
 * Roulette over seasonal patch weights, in ascending index; draws one float from `rng`.
 * @param {World} world the world; needs at least one patch
 * @param {Rng} rng the stream to draw from
 * @returns {number} the patch index
 */
export function pickPatch(world, rng) {
    let total = 0;
    let last = -1;
    for (let i = 0; i < world.patchWeight.length; i++) {
        if (world.patchAlive[i] === 1 && world.patchWeight[i] > 0) {
            total += world.patchWeight[i];
            last = i;
        }
    }
    let remaining = nextFloat(rng) * total;
    if (last < 0) {
        return -1;
    }
    for (let i = 0; i < last; i++) {
        remaining -= world.patchAlive[i] === 1 ? world.patchWeight[i] : 0;
        if (remaining < 0) {
            return i;
        }
    }
    return last;
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
        if (world.patchAlive[i] !== 1) {
            continue;
        }
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
        if (world.patchAlive[i] !== 1) {
            continue;
        }
        const stock = Math.min(foodPatchCapacity, Math.max(floor, patchStock[i]));
        const grown =
            stock +
            world.patchRegrow[i] *
                foodPatchRegrow *
                patchRegrowFactor(world, i) *
                stock *
                (1 - stock / foodPatchCapacity);
        patchStock[i] = Math.min(foodPatchCapacity, grown);
    }
}
