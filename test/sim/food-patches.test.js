import { allocBody } from './helpers/body.js';
import { describe, expect, it } from 'vitest';
import {
    PATCH_FLOOR_SHARE,
    createPatches,
    depletePatchAt,
    pickPatch,
    regrowPatches,
} from '../../js/sim/food-patches.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { createRng } from '../../js/sim/rng.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { smallWorld } from './helpers/small-world.js';

const PATCHES = { foodPatchCount: 3, foodPatchRadius: 100 };

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof smallWorld>} a world with three patches at known places and stocks
 */
function patched(over = {}) {
    const w = smallWorld({ ...PATCHES, ...over });
    [
        [200, 200, 0.5],
        [600, 200, 0.3],
        [600, 700, 0.2],
    ].forEach(([x, y, stock], i) => {
        w.patchX[i] = x;
        w.patchY[i] = y;
        w.patchStock[i] = stock;
    });
    return w;
}

describe('createPatches', () => {
    it('places the configured patches inside the world, inset by the radius, at full stock', () => {
        const w = smallWorld({ ...PATCHES, foodPatchCount: 16, foodPatchCapacity: 2 });
        expect(w.patchX.length).toBe(16);
        for (let i = 0; i < 16; i++) {
            expect(w.patchX[i]).toBeGreaterThanOrEqual(100);
            expect(w.patchX[i]).toBeLessThanOrEqual(900);
            expect(w.patchY[i]).toBeGreaterThanOrEqual(100);
            expect(w.patchY[i]).toBeLessThanOrEqual(900);
            expect(w.patchStock[i]).toBe(2);
        }
    });

    it('is deterministic for a seed and differs between seeds', () => {
        const a = smallWorld({ ...PATCHES, seed: 4 });
        const b = smallWorld({ ...PATCHES, seed: 4 });
        const c = smallWorld({ ...PATCHES, seed: 5 });
        expect(hashWorld(a)).toBe(hashWorld(b));
        expect(Array.from(a.patchX)).toEqual(Array.from(b.patchX));
        expect(Array.from(a.patchX)).not.toEqual(Array.from(c.patchX));
    });

    it('pushes FoodPatchesCreated with the count and radius', () => {
        const w = smallWorld(PATCHES);
        expect(w.events.count).toBe(1);
        expect(Array.from(w.events.data.subarray(0, EVENT_STRIDE)).slice(0, 4)).toEqual([
            EVENT_TYPE.FOOD_PATCHES_CREATED,
            0,
            3,
            100,
        ]);
    });

    it('is the off state at foodPatchCount 0: empty arrays, no event, no draw from the food stream', () => {
        const off = smallWorld();
        expect(off.patchX.length).toBe(0);
        expect(off.patchStock.length).toBe(0);
        expect(off.events.count).toBe(0);
        const before = Array.from(off.rng.food.s);
        createPatches(off);
        expect(Array.from(off.rng.food.s)).toEqual(before);
    });

    it('hashes the patch stock', () => {
        const w = patched();
        const before = hashWorld(w);
        w.patchStock[1] += 0.1;
        expect(hashWorld(w)).not.toBe(before);
    });
});

describe('pickPatch', () => {
    it('chooses patches in proportion to their stock', () => {
        const w = patched();
        const rng = createRng(9);
        const hits = [0, 0, 0];
        const draws = 20000;
        for (let i = 0; i < draws; i++) {
            hits[pickPatch(w, rng)] += 1;
        }
        [0.5, 0.3, 0.2].forEach((share, i) => {
            expect(hits[i] / draws).toBeCloseTo(share, 1);
        });
    });

    it('never picks a patch with no stock', () => {
        const w = patched();
        w.patchStock[0] = 0;
        const rng = createRng(2);
        for (let i = 0; i < 500; i++) {
            expect(pickPatch(w, rng)).not.toBe(0);
        }
    });
});

describe('depletion', () => {
    it('takes foodPatchDepletion from the patch containing the point, and from no other', () => {
        const w = patched({ foodPatchDepletion: 0.1 });
        depletePatchAt(w, 250, 250);
        expect(Array.from(w.patchStock)).toEqual([0.4, 0.3, 0.2]);
        depletePatchAt(w, 400, 450);
        expect(Array.from(w.patchStock)).toEqual([0.4, 0.3, 0.2]);
    });

    it('takes from the nearest patch whose disc holds the point, the lowest index on a tie', () => {
        const w = patched({ foodPatchDepletion: 0.1 });
        w.patchX.set([200, 260, 200]);
        w.patchY.set([200, 200, 200]);
        w.patchStock.set([0.5, 0.5, 0.5]);
        depletePatchAt(w, 250, 200);
        expect(Array.from(w.patchStock)).toEqual([0.5, 0.4, 0.5]);
        depletePatchAt(w, 200, 200);
        expect(Array.from(w.patchStock)).toEqual([0.4, 0.4, 0.5]);
    });

    it('never goes below the floor', () => {
        const w = patched({ foodPatchDepletion: 1 });
        depletePatchAt(w, 600, 700);
        expect(w.patchStock[2]).toBe(PATCH_FLOOR_SHARE);
    });

    it('is applied when an agent eats food inside a patch, and not outside', () => {
        const w = patched({ foodPatchDepletion: 0.1, maxFood: 4 });
        const slot = allocBody(w);
        w.x[slot] = 200;
        w.y[slot] = 200;
        addEnergy(w, slot, 20, ENERGY_SOURCE.INITIAL);
        const put = (/** @type {number} */ i, /** @type {number} */ x, /** @type {number} */ y) => {
            Object.assign(w.foodAlive, { [i]: 1 });
            w.foodX[i] = x;
            w.foodY[i] = y;
            w.foodRadius[i] = 5;
            w.foodValue[i] = 7;
            w.foodCount += 1;
        };
        put(0, 200, 200);
        const hash = createSpatialHash(w.config);
        buildHash(hash, w);
        feed(w, hash);
        expect(w.foodAlive[0]).toBe(0);
        expect(w.patchStock[0]).toBeCloseTo(0.4, 12);
        w.x[slot] = 400;
        w.y[slot] = 450;
        put(1, 400, 450);
        buildHash(hash, w);
        feed(w, hash);
        expect(w.foodAlive[1]).toBe(0);
        expect(Array.from(w.patchStock).map((s) => Number(s.toFixed(12)))).toEqual([0.4, 0.3, 0.2]);
    });
});

describe('regrowPatches', () => {
    it('grows logistically toward the capacity', () => {
        const w = patched({ foodPatchRegrow: 0.01 });
        regrowPatches(w);
        expect(w.patchStock[0]).toBeCloseTo(0.5 + 0.01 * 0.5 * 0.5, 12);
        expect(w.patchStock[2]).toBeCloseTo(0.2 + 0.01 * 0.2 * 0.8, 12);
        for (let i = 0; i < 5000; i++) {
            regrowPatches(w);
        }
        expect(w.patchStock[0]).toBeGreaterThan(0.99);
        expect(w.patchStock[0]).toBeLessThanOrEqual(1);
    });

    it('scales the logistic term with foodPatchCapacity', () => {
        const w = patched({ foodPatchRegrow: 0.1, foodPatchCapacity: 2 });
        regrowPatches(w);
        expect(w.patchStock[0]).toBeCloseTo(0.5 + 0.1 * 0.5 * (1 - 0.25), 12);
    });

    it('lifts a patch at or below the floor so it never dies, even with no regrowth', () => {
        const w = patched({ foodPatchRegrow: 0 });
        w.patchStock[1] = 0;
        regrowPatches(w);
        expect(w.patchStock[1]).toBe(PATCH_FLOOR_SHARE);
    });

    it('clamps stock above the capacity back to it', () => {
        const w = patched();
        w.patchStock[0] = 5;
        regrowPatches(w);
        expect(w.patchStock[0]).toBe(1);
    });

    it('does nothing without patches', () => {
        const w = smallWorld();
        const before = hashWorld(w);
        regrowPatches(w);
        expect(hashWorld(w)).toBe(before);
    });
});
