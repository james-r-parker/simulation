import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createWorld, spawnFoodItem } from '../../js/sim/spawn.js';
import { testPolicy } from './helpers/test-policy.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const BASE = {
    worldWidth: 4000,
    worldHeight: 4000,
    maxAgents: 4,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 1000,
    initialFood: 0,
    fertileZoneMax: 3,
    foodPatchCount: 4,
    foodPatchRadius: 200,
};

/**
 * @param {Record<string, any>} over config overrides
 * @returns {ReturnType<typeof createWorld>}
 */
function build(over) {
    return createWorld(createConfig({ ...SIMPLE_WORLD, ...BASE, ...over }), testPolicy);
}

/**
 * @param {ReturnType<typeof createWorld>} w the world
 * @param {number} slot a food slot
 * @returns {number} the index of the patch containing the food, or -1
 */
function patchOf(w, slot) {
    for (let i = 0; i < w.patchX.length; i++) {
        if (Math.hypot(w.foodX[slot] - w.patchX[i], w.foodY[slot] - w.patchY[i]) <= 200 + 1e-3) {
            return i;
        }
    }
    return -1;
}

describe('spawnFoodItem with patches', () => {
    it('places every item inside a patch when the background share is 0', () => {
        const w = build({ foodBackgroundShare: 0 });
        for (let i = 0; i < 300; i++) {
            expect(patchOf(w, spawnFoodItem(w))).toBeGreaterThanOrEqual(0);
        }
    });

    it('sends about the background share anywhere in the world', () => {
        const w = build({ foodBackgroundShare: 0.5 });
        let inside = 0;
        const n = 800;
        for (let i = 0; i < n; i++) {
            inside += patchOf(w, spawnFoodItem(w)) >= 0 ? 1 : 0;
        }
        // Patches cover 4 x pi x 200^2 of 16e6 (about 3%), so nearly every outside item is a background one.
        expect(inside / n).toBeGreaterThan(0.45);
        expect(inside / n).toBeLessThan(0.6);
    });

    it('weights patches by seasonal weight', () => {
        const w = build({ foodBackgroundShare: 0 });
        w.patchWeight.set([0.05, 0.05, 0.05, 3]);
        const hits = [0, 0, 0, 0];
        for (let i = 0; i < 400; i++) {
            hits[patchOf(w, spawnFoodItem(w))] += 1;
            w.foodAlive.fill(0);
            w.foodCount = 0;
        }
        expect(hits[3]).toBeGreaterThan(300);
    });

    it('keeps items inside the world and clear of obstacles', () => {
        const w = build({ foodBackgroundShare: 0 });
        for (let i = 0; i < 200; i++) {
            const s = spawnFoodItem(w);
            expect(w.foodX[s]).toBeGreaterThanOrEqual(w.foodRadius[s]);
            expect(w.foodY[s]).toBeLessThanOrEqual(4000 - w.foodRadius[s]);
            for (let o = 0; o < w.obsX.length; o++) {
                expect(Math.hypot(w.foodX[s] - w.obsX[o], w.foodY[s] - w.obsY[o])).toBeGreaterThanOrEqual(
                    w.obsRadius[o] + w.foodRadius[s],
                );
            }
        }
    });

    it('replays the same items from the same seed', () => {
        const a = build({ seed: 8 });
        const b = build({ seed: 8 });
        for (let i = 0; i < 50; i++) {
            const s = spawnFoodItem(a);
            expect([a.foodX[s], a.foodY[s]]).toEqual([b.foodX[spawnFoodItem(b)], b.foodY[s]]);
        }
    });
});

describe('spawnFoodItem order', () => {
    it('keeps the mycelium draw first: fungus is not forced into a patch', () => {
        const w = build({ foodBackgroundShare: 0, fertileZoneSpawnChance: 1, myceliumRadius: 50 });
        w.season[1] = 0.795;
        w.myceliumTicks[0] = 1;
        w.myceliumX[0] = 3900;
        w.myceliumY[0] = 3900;
        w.myceliumSize[0] = 1;
        w.patchX.fill(300);
        w.patchY.fill(300);
        const s = spawnFoodItem(w);
        expect(w.foodX[s]).toBeGreaterThan(3800);
        expect(patchOf(w, s)).toBe(-1);
    });
});
