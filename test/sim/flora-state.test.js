import { describe, expect, it } from 'vitest';
import { FLORA_NAMES } from '../../js/sim/config-flora.js';
import { FLORA_ARRAYS, assertFlora } from '../../js/sim/flora-state.js';
import { smallWorld } from './helpers/small-world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { removeFood } from '../../js/sim/world.js';

const PATCHES = { floraPatchMax: 16, foodPatchCount: 16, foodPatchRadius: 100 };

describe('flora state', () => {
    it('assigns the starting patch mix without fungus patches', () => {
        const w = smallWorld(PATCHES);
        const counts = [0, 0, 0, 0, 0, 0];
        for (const species of w.patchSpecies) {
            counts[species]++;
        }
        expect(counts).toEqual([5, 3, 2, 3, 0, 3]);
        expect(w.patchLife[8]).toBe(60000);
    });

    it('breaks remainder ties in table order', () => {
        const w = smallWorld({
            floraPatchMax: 2,
            foodPatchCount: 2,
            foodPatchRadius: 100,
            flora: {
                grass: { share: 1 },
                berry: { share: 1 },
                nut: { share: 1 },
                flower: { share: 1 },
                toxiccap: { share: 0 },
            },
        });
        expect(Array.from(w.patchSpecies)).toEqual([0, 1]);
    });

    it('allocates the full patch pool with only initial slots alive', () => {
        const w = smallWorld({ foodPatchCount: 2, floraPatchMax: 5, foodPatchRadius: 100 });
        expect(Array.from(w.patchAlive)).toEqual([1, 1, 0, 0, 0]);
        expect(Array.from(w.patchSerial)).toEqual([1, 1, 0, 0, 0]);
        expect(w.patchStock[4]).toBe(0);
        expect(() => smallWorld({ foodPatchCount: 3, floraPatchMax: 2 })).toThrow('floraPatchMax');
    });

    it('hashes every persistent species and trait array', () => {
        const w = smallWorld(PATCHES);
        for (const name of FLORA_ARRAYS) {
            const before = hashWorld(w);
            w[name][0] += 1;
            expect(hashWorld(w), name).not.toBe(before);
            w[name][0] -= 1;
        }
    });

    it('zeroes all item traits when a food slot is freed', () => {
        const w = smallWorld();
        const slot = spawnFoodItem(w);
        expect(w.foodPatch[slot]).toBe(-1);
        removeFood(w, slot);
        for (const name of FLORA_ARRAYS.filter((field) => field.startsWith('food'))) {
            expect(w[name][slot], name).toBe(0);
        }
    });

    it('rejects nonfinite trait records and invalid species', () => {
        const w = smallWorld(PATCHES);
        w.patchHue[0] = NaN;
        expect(() => assertFlora(w)).toThrow('patchHue');
        w.patchHue[0] = 0;
        const slot = spawnFoodItem(w);
        w.foodSpecies[slot] = 6;
        expect(() => assertFlora(w)).toThrow('foodSpecies');
    });
    for (const [name, value] of [
        ['foodSpecies', 0.5],
        ['foodLife', 0],
        ['foodHue', 2],
        ['foodPatch', 100],
        ['foodTox', -1],
    ]) {
        it(`rejects invalid ${name} on a live item`, () => {
            const w = smallWorld(PATCHES);
            const slot = spawnFoodItem(w);
            w[name][slot] = value;
            expect(() => assertFlora(w)).toThrow(name);
        });
    }
    it('accepts no initial patch shares only when there are no patches', () => {
        const flora = Object.fromEntries(FLORA_NAMES.map((name) => [name, { share: 0 }]));
        const w = smallWorld({ flora });
        expect(w.patchAlive.every((/** @type {number} */ alive) => alive === 0)).toBe(true);
        expect(() => assertFlora(w)).not.toThrow();
        expect(() => smallWorld({ ...PATCHES, flora })).toThrow('positive share');
    });

    for (const [field, value] of [
        ['patchSpecies', 255],
        ['patchHue', 2],
    ]) {
        it(`rejects an invalid ${field} before a spawn`, () => {
            const w = smallWorld(PATCHES);
            w[field][0] = value;
            expect(() => assertFlora(w)).toThrow('patch species or hue');
        });
    }

    it('rejects source patch values below the background sentinel', () => {
        const w = smallWorld();
        const slot = spawnFoodItem(w);
        w.foodPatch[slot] = -2;
        expect(() => assertFlora(w)).toThrow('foodPatch');
    });
});
