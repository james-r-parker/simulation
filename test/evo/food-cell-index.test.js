// The food cell index (eat-choice.md, Phase 5, T20): its contact answer equals the naive O(agents x food) scan.

import { describe, expect, it } from 'vitest';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { CONTACT, buildFoodCellIndex, createFoodCellIndex, touchesFood } from '../../js/evo/food-cell-index.js';

const CONFIG = { worldWidth: 1000, worldHeight: 600, maxFood: 300 };

/** @param {number} seed @returns {() => number} a seeded generator of floats in [0, 1) (mulberry32) */
function rng(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * @param {number} seed the seed
 * @returns {Record<string, any>} a random world: 80 agents and `maxFood` food slots (a third dead), some positions off the grid
 */
function randomWorld(seed) {
    const r = rng(seed);
    const agents = 80;
    const foods = CONFIG.maxFood;
    const at = (/** @type {number} */ extent) => -50 + r() * (extent + 100);
    const w = {
        spec: Uint8Array.from({ length: agents }, () => Math.floor(r() * 3)),
        x: Float32Array.from({ length: agents }, () => at(CONFIG.worldWidth)),
        y: Float32Array.from({ length: agents }, () => at(CONFIG.worldHeight)),
        size: Float32Array.from({ length: agents }, () => 4 + r() * 30),
        plantFoodBySpec: Float64Array.from([1, 0, 0.5]),
        meatFoodBySpec: Float64Array.from([0, 1, 1]),
        foodAlive: Uint8Array.from({ length: foods }, () => (r() < 0.67 ? 1 : 0)),
        foodKind: Uint8Array.from({ length: foods }, () => (r() < 0.5 ? FOOD_KIND.PLANT : FOOD_KIND.MEAT)),
        foodX: Float32Array.from({ length: foods }, () => at(CONFIG.worldWidth)),
        foodY: Float32Array.from({ length: foods }, () => at(CONFIG.worldHeight)),
        foodRadius: Float32Array.from({ length: foods }, () => 2 + r() * 40),
    };
    return w;
}

/**
 * The scan the index replaces: every food item against the agent, by the contact test of `tryEat`.
 * @param {Record<string, any>} w the world
 * @param {number} slot the agent
 * @param {number} mode a `CONTACT` mode
 * @returns {boolean} whether the agent touches an alive item the mode counts
 */
function naive(w, slot, mode) {
    for (let food = 0; food < w.foodAlive.length; food++) {
        const meat = w.foodKind[food] === FOOD_KIND.MEAT;
        const counts =
            mode === CONTACT.EDIBLE ? (meat ? w.meatFoodBySpec : w.plantFoodBySpec)[w.spec[slot]] > 0 : !meat;
        const dx = w.foodX[food] - w.x[slot];
        const dy = w.foodY[food] - w.y[slot];
        if (w.foodAlive[food] === 1 && counts && Math.sqrt(dx * dx + dy * dy) < w.size[slot] + w.foodRadius[food]) {
            return true;
        }
    }
    return false;
}

describe('touchesFood', () => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('equals the naive scan on a seeded random world (seed %i)', (seed) => {
        const w = randomWorld(seed);
        const index = createFoodCellIndex(CONFIG);
        buildFoodCellIndex(index, w);
        let hits = 0;
        for (const mode of [CONTACT.EDIBLE, CONTACT.PLANT]) {
            for (let slot = 0; slot < w.x.length; slot++) {
                const expected = naive(w, slot, mode);
                hits += expected ? 1 : 0;
                expect(touchesFood(index, w, { slot, mode }), `slot ${slot} mode ${mode}`).toBe(expected);
            }
        }
        expect(hits).toBeGreaterThan(10);
        expect(hits).toBeLessThan(2 * w.x.length - 10);
    });

    it('reads only the alive food, and counts them', () => {
        const w = randomWorld(9);
        const index = createFoodCellIndex(CONFIG);
        buildFoodCellIndex(index, w);
        expect(index.count).toBe(w.foodAlive.reduce((n, a) => n + a, 0));
    });

    it('is rebuilt from the world each time: food that is gone no longer touches', () => {
        const w = randomWorld(10);
        const index = createFoodCellIndex(CONFIG);
        buildFoodCellIndex(index, w);
        w.foodAlive.fill(0);
        buildFoodCellIndex(index, w);
        expect(index.count).toBe(0);
        for (let slot = 0; slot < w.x.length; slot++) {
            expect(touchesFood(index, w, { slot, mode: CONTACT.PLANT })).toBe(false);
        }
    });

    it('does not count touching exactly, as tryEat does not', () => {
        const w = randomWorld(11);
        w.foodAlive.fill(0);
        w.foodAlive[0] = 1;
        w.foodKind[0] = FOOD_KIND.PLANT;
        w.foodX[0] = 100;
        w.foodY[0] = 100;
        w.foodRadius[0] = 2;
        w.x[0] = 107;
        w.y[0] = 100;
        w.size[0] = 5;
        w.spec[0] = 0;
        const index = createFoodCellIndex(CONFIG);
        buildFoodCellIndex(index, w);
        expect(touchesFood(index, w, { slot: 0, mode: CONTACT.EDIBLE })).toBe(false);
        w.x[0] = 106.9;
        expect(touchesFood(index, w, { slot: 0, mode: CONTACT.EDIBLE })).toBe(true);
    });
});
