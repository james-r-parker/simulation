import { describe, expect, it } from 'vitest';
import { FLORA_NAMES } from '../../js/sim/config-flora.js';
import { FLORA_ARRAYS, assertFlora } from '../../js/sim/flora-state.js';
import { smallWorld } from './helpers/small-world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { removeFood } from '../../js/sim/world.js';

const PATCHES = { foodPatchCount: 16, foodPatchRadius: 100 };

describe('flora state', () => {
    it('assigns largest remainders in species order without introducing cap or fungus patches', () => {
        const w = smallWorld(PATCHES);
        const counts = [0, 0, 0, 0, 0, 0];
        for (const species of w.patchSpecies) {
            counts[species]++;
        }
        expect(counts).toEqual([6, 4, 2, 4, 0, 0]);
        expect(w.patchLife[10]).toBe(60000);
    });

    it('breaks remainder ties in table order', () => {
        const w = smallWorld({
            foodPatchCount: 2,
            foodPatchRadius: 100,
            flora: {
                grass: { share: 1 },
                berry: { share: 1 },
                nut: { share: 1 },
                flower: { share: 1 },
            },
        });
        expect(Array.from(w.patchSpecies)).toEqual([0, 1]);
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
        expect(w.patchSpecies).toHaveLength(0);
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
