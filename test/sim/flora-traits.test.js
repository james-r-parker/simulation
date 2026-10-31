import { describe, expect, it } from 'vitest';
import { blendTraits, mutateTraits } from '../../js/sim/flora-traits.js';
import { createConfig } from '../../js/sim/config.js';
import { nextGaussian } from '../../js/sim/rng.js';
import { assertFlora } from '../../js/sim/flora-state.js';
import { smallWorld } from './helpers/small-world.js';

/** @param {Record<string, any>} [over] config overrides @returns {any} two berry parents and a free child slot */
function garden(over = {}) {
    const w = smallWorld({
        foodPatchCount: 2,
        floraPatchMax: 3,
        foodPatchRadius: 100,
        flora: {
            grass: { share: 0 },
            berry: { share: 1 },
            nut: { share: 0 },
            flower: { share: 0 },
            toxiccap: { share: 0 },
        },
        ...over,
    });
    w.patchSpecies[2] = 1;
    return w;
}

describe('flora traits', () => {
    it('inherits exact means without mutation and leaves the parents unchanged', () => {
        const w = garden({ floraMutation: 0 });
        w.patchEnergy.set([1.2, 1.8]);
        w.patchRegrow.set([0.8, 1.2]);
        w.patchLife.set([10000, 14000]);
        w.patchHue.set([0.5, 0.7]);
        w.patchStart.set([0.2, 0.3]);
        blendTraits(w, 0, 1);
        mutateTraits(w, 2);
        expect(w.patchEnergy[2]).toBeCloseTo(1.5);
        expect(w.patchRegrow[2]).toBeCloseTo(1);
        expect(w.patchLife[2]).toBeCloseTo(12000);
        expect(w.patchHue[2]).toBeCloseTo(0.6);
        expect(w.patchStart[2]).toBeCloseTo(0.25);
        expect(w.patchLife[0]).toBe(10000);
    });

    it('blends year phases as offsets about the species start across the year seam', () => {
        const w = garden({ floraMutation: 0, flora: { berry: { start: 0 } } });
        w.patchStart.set([0.99, 0.01]);
        blendTraits(w, 0, 1);
        expect(Math.abs(w.floraTraits[4])).toBeLessThan(1e-7);
        mutateTraits(w, 2);
        expect(Math.min(w.patchStart[2], 1 - w.patchStart[2])).toBeLessThan(1e-7);
    });

    it('clamps every mutated trait to its archetype range and hue to the signal bounds', () => {
        const w = garden({ floraMutation: 100 });
        const row = w.config.flora.berry;
        for (let sample = 0; sample < 40; sample++) {
            blendTraits(w, 0, 1);
            mutateTraits(w, 2);
            for (const [field, key] of [
                ['patchEnergy', 'energy'],
                ['patchRegrow', 'regrow'],
                ['patchLife', 'life'],
            ]) {
                expect(w[field][2]).toBeGreaterThanOrEqual(row[key] * (1 - row.range) - 1e-5);
                expect(w[field][2]).toBeLessThanOrEqual(row[key] * (1 + row.range) + 1e-5);
            }
            expect(w.patchHue[2]).toBeGreaterThanOrEqual(0.35 - 1e-7);
            expect(w.patchHue[2]).toBeLessThanOrEqual(0.95 + 1e-7);
            expect(w.patchStart[2]).toBeGreaterThanOrEqual(0.175 - 1e-7);
            expect(w.patchStart[2]).toBeLessThanOrEqual(0.325 + 1e-7);
        }
        w.patchSpecies[2] = 3;
        w.floraTraits[3] = 2;
        mutateTraits(w, 2);
        expect(w.patchHue[2]).toBeLessThanOrEqual(1);
    });

    it('draws exactly five Gaussians, even when mutation and species range are zero', () => {
        const w = garden({ floraMutation: 0, flora: { berry: { range: 0 } } });
        const expected = { seed: w.rng.flora.seed, s: w.rng.flora.s.slice() };
        for (let i = 0; i < 5; i++) {
            nextGaussian(expected);
        }
        blendTraits(w, 0, 1);
        mutateTraits(w, 2);
        expect(w.rng.flora.s).toEqual(expected.s);
    });

    it('stores a near-one start as canonical zero at initial assignment and mutation', () => {
        const w = garden({ floraMutation: 0, flora: { berry: { start: 0.999999999, range: 0 } } });
        expect(w.patchStart[0]).toBe(0);
        expect(() => assertFlora(w)).not.toThrow();
        blendTraits(w, 0, 1);
        mutateTraits(w, 2);
        expect(w.patchStart[2]).toBe(0);
    });

    it('rejects a negative mutation scale', () => {
        expect(() => createConfig({ floraMutation: -1 })).toThrow('floraMutation');
    });
});
