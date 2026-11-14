import { describe, expect, it } from 'vitest';
import { PATCH_FLOOR_SHARE } from '../../js/sim/food-patches.js';
import { refreshFruiting } from '../../js/sim/fruiting.js';
import { spawnFood } from '../../js/sim/food.js';
import { nextFloat } from '../../js/sim/rng.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { smallWorld } from './helpers/small-world.js';

const CAPACITY = 1000;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof smallWorld>} one berry patch, no background, at full stock
 */
function berries(over = {}) {
    const w = smallWorld({
        patchStockEnergy: true,
        foodPatchCount: 1,
        foodPatchRadius: 100,
        foodPatchCapacity: CAPACITY,
        foodBackgroundShare: 0,
        maxFood: 200,
        foodRegrowPerArea: 4,
        flora: {
            grass: { share: 0 },
            berry: { share: 1 },
            nut: { share: 0 },
            flower: { share: 0 },
            toxiccap: { share: 0 },
        },
        ...over,
    });
    w.season[1] = 0.4;
    refreshFruiting(w);
    return w;
}

describe('spawnFloraItem in the energy model', () => {
    it('reserves the energy of a placed patch item', () => {
        const w = berries();
        const slot = spawnFoodItem(w);
        expect(w.foodPatch[slot]).toBe(0);
        expect(w.patchReserved[0]).toBe(w.foodValue[slot]);
        expect(w.patchStock[0]).toBe(CAPACITY);
        const second = spawnFoodItem(w);
        expect(w.patchReserved[0]).toBeCloseTo(w.foodValue[slot] + w.foodValue[second], 9);
    });

    it('refuses an attempt the free stock cannot pay above the floor, before placement and before any more draws', () => {
        const w = berries();
        w.patchStock[0] = PATCH_FLOOR_SHARE * CAPACITY + 100;
        const probe = berries();
        nextFloat(probe.rng.food); // the background-share draw
        nextFloat(probe.rng.food); // the patch pick
        expect(spawnFoodItem(w)).toBe(-1);
        expect(w.foodCount).toBe(0);
        expect(w.patchReserved[0]).toBe(0);
        expect(w.foodAlive.some((/** @type {number} */ a) => a === 1)).toBe(false);
        expect(w.rng.food).toEqual(probe.rng.food);
    });

    it('stops placing once the reservation uses the free stock, and never reserves past it', () => {
        const w = berries();
        for (let i = 0; i < 50; i++) {
            spawnFoodItem(w);
        }
        const free = CAPACITY - PATCH_FLOOR_SHARE * CAPACITY;
        expect(w.patchReserved[0]).toBeLessThanOrEqual(free);
        expect(w.patchReserved[0]).toBeGreaterThan(free - 250);
        expect(w.foodCount).toBeLessThan(50);
    });

    it('lets a spawn tick pass with every attempt refused', () => {
        const w = berries();
        w.patchStock[0] = PATCH_FLOOR_SHARE * CAPACITY;
        spawnFood(w);
        expect(w.foodCount).toBe(0);
    });

    it('keeps an unvisited patch full over many ticks of spawning', () => {
        const w = berries();
        for (let t = 0; t < 300; t++) {
            spawnFood(w);
        }
        expect(w.patchStock[0]).toBe(CAPACITY);
        expect(w.patchReserved[0]).toBeLessThanOrEqual(CAPACITY - PATCH_FLOOR_SHARE * CAPACITY);
        let standing = 0;
        for (let i = 0; i < w.foodAlive.length; i++) {
            standing += w.foodAlive[i] === 1 ? w.foodValue[i] : 0;
        }
        expect(w.patchReserved[0]).toBeCloseTo(standing, 6);
    });

    it('takes no stock for a background item', () => {
        const w = berries({ foodBackgroundShare: 1 });
        const slot = spawnFoodItem(w);
        expect(w.foodPatch[slot]).toBe(-1);
        expect(w.patchReserved[0]).toBe(0);
    });

    it('leaves the weight model unchanged with patchStockEnergy false', () => {
        const w = berries({ patchStockEnergy: false, foodPatchCapacity: 1 });
        for (let i = 0; i < 20; i++) {
            expect(spawnFoodItem(w)).toBeGreaterThanOrEqual(0);
        }
        expect(w.patchReserved[0]).toBe(0);
        expect(w.foodCount).toBe(20);
    });
});
