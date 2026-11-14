// The energy model of a patch (`patchStockEnergy`): a patch's stock is energy, its standing items reserve part of it,
// a meal spends it and an item that goes unseaten gives its reservation back. Pure bookkeeping on world arrays.
import { PATCH_FLOOR_SHARE } from './patch-life.js';

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @param {number} food a food slot
 * @returns {number} the living patch that still sources the item (same serial), or -1 for background, dung, fungus,
 *   carcass and stale items
 */
export function livePatchOf(world, food) {
    const patch = world.foodPatch[food];
    return patch >= 0 && world.patchAlive[patch] === 1 && world.foodPatchSerial[food] === world.patchSerial[patch]
        ? patch
        : -1;
}

/**
 * Adds a placed item's energy to its patch's reservation.
 * @param {World} world the world
 * @param {number} food the new item's slot
 * @returns {void}
 */
export function reserveItem(world, food) {
    const patch = livePatchOf(world, food);
    if (patch >= 0) {
        world.patchReserved[patch] += world.foodValue[food];
    }
}

/**
 * Returns an item's energy to its patch's reservation, whatever removes the item; the stock is untouched.
 * @param {World} world the world
 * @param {number} food the food slot about to be removed
 * @returns {void}
 */
export function releaseItem(world, food) {
    const patch = livePatchOf(world, food);
    if (patch >= 0) {
        world.patchReserved[patch] = Math.max(0, world.patchReserved[patch] - world.foodValue[food]);
    }
}

/**
 * A plant meal takes the item's energy from its patch's stock, never below the floor. The reservation falls when
 * the item is removed (`removeFood`).
 * @param {World} world the world
 * @param {number} food the eaten item, still alive
 * @returns {void}
 */
export function spendItem(world, food) {
    const patch = livePatchOf(world, food);
    if (patch >= 0) {
        const floor = PATCH_FLOOR_SHARE * world.config.foodPatchCapacity;
        world.patchStock[patch] = Math.max(floor, world.patchStock[patch] - world.foodValue[food]);
    }
}

/**
 * @param {World} world the world
 * @param {number} patch the picked patch
 * @param {number} energy the largest energy the new item can hold
 * @returns {boolean} whether the free stock pays for it and stays at or above the floor
 */
export function canPay(world, patch, energy) {
    const floor = PATCH_FLOOR_SHARE * world.config.foodPatchCapacity;
    return world.patchStock[patch] - world.patchReserved[patch] - energy >= floor;
}
