import { describe, expect, it } from 'vitest';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { refreshFruiting } from '../../js/sim/fruiting.js';
import { pickPatch, regrowPatches } from '../../js/sim/food-patches.js';
import { ageFood } from '../../js/sim/food.js';
import { smallWorld } from './helpers/small-world.js';

/** @returns {ReturnType<typeof smallWorld>} one berry patch, no background */
function berries() {
    const w = smallWorld({
        foodPatchCount: 1,
        foodPatchRadius: 100,
        foodBackgroundShare: 0,
        flora: {
            grass: { share: 0 },
            berry: { share: 1 },
            nut: { share: 0 },
            flower: { share: 0 },
        },
    });
    w.season[1] = 0.4;
    refreshFruiting(w);
    return w;
}

describe('species spawning', () => {
    it('copies patch traits without changing items when the patch changes', () => {
        const w = berries();
        const slot = spawnFoodItem(w);
        expect(w.foodSpecies[slot]).toBe(1);
        expect(w.foodPatch[slot]).toBe(0);
        expect(w.foodHue[slot]).toBeCloseTo(0.65);
        expect(w.foodLife[slot]).toBe(12000);
        expect(w.foodRadius[slot]).toBe(22);
        expect(w.foodValue[slot]).toBeGreaterThanOrEqual(130);
        expect(w.foodValue[slot]).toBeLessThanOrEqual(170);
        w.patchHue[0] = -1;
        w.patchLife[0] = 1;
        expect(w.foodHue[slot]).toBeCloseTo(0.65);
        expect(w.foodLife[slot]).toBe(12000);
    });

    it('falls back to grass when every patch is out of season', () => {
        const w = berries();
        w.season[1] = 0.9;
        refreshFruiting(w);
        expect(pickPatch(w, w.rng.food)).toBe(-1);
        const slot = spawnFoodItem(w);
        expect(w.foodSpecies[slot]).toBe(0);
        expect(w.foodPatch[slot]).toBe(-1);
    });

    it('keeps background draws grass during berry season', () => {
        const w = smallWorld({ maxFood: 16, foodPatchCount: 4, foodPatchRadius: 100, foodBackgroundShare: 1 });
        w.season[1] = 0.4;
        refreshFruiting(w);
        for (let i = 0; i < 10; i++) {
            expect(w.foodSpecies[spawnFoodItem(w)]).toBe(0);
        }
    });

    it('uses the item lifetime and keeps a nut across seasons', () => {
        const w = berries();
        const slot = spawnFoodItem(w);
        w.foodLife[slot] = 60000;
        w.foodAge[slot] = 59999;
        w.season[1] = 0;
        ageFood(w);
        expect(w.foodAlive[slot]).toBe(1);
        ageFood(w);
        expect(w.foodAlive[slot]).toBe(0);
    });

    it('multiplies regrowth by the stored patch trait', () => {
        const a = berries();
        const b = berries();
        a.patchStock[0] = b.patchStock[0] = 0.5;
        a.patchRegrow[0] = 1;
        b.patchRegrow[0] = 2;
        regrowPatches(a);
        regrowPatches(b);
        expect(b.patchStock[0] - 0.5).toBeCloseTo(2 * (a.patchStock[0] - 0.5), 12);
    });
    it('falls back to clear background placement when an entire patch disc is blocked', () => {
        const w = smallWorld({ foodPatchCount: 1, foodPatchRadius: 1, foodBackgroundShare: 0, placementTries: 5 });
        w.patchX[0] = w.patchY[0] = 500;
        w.obsX.fill(1e6);
        w.obsY.fill(1e6);
        w.obsX[0] = w.obsY[0] = 500;
        w.obsRadius[0] = 100;
        const slot = spawnFoodItem(w);
        expect(w.foodPatch[slot]).toBe(0);
        expect(Math.hypot(w.foodX[slot] - 500, w.foodY[slot] - 500)).toBeGreaterThanOrEqual(100 + w.foodRadius[slot]);
    });
});
