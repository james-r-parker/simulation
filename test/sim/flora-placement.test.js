import { describe, expect, it } from 'vitest';
import { placeSeed } from '../../js/sim/flora-placement.js';
import { nextFloat } from '../../js/sim/rng.js';
import { floraGarden } from './helpers/flora-garden.js';

const TWO_PI = 6.283185307179586;

describe('local seed placement', () => {
    it('starts on the configured ring and only advances the flora stream', () => {
        const w = floraGarden();
        const food = w.rng.food.s.slice();
        const expected = { seed: w.rng.flora.seed, s: w.rng.flora.s.slice() };
        nextFloat(expected);
        nextFloat(expected);
        expect(placeSeed(w, 1)).toBe(true);
        expect(Math.hypot(w.point[0] - 500, w.point[1] - 500)).toBeCloseTo(150, 9);
        expect(w.rng.flora.s).toEqual(expected.s);
        expect(w.rng.food.s).toEqual(food);
    });

    for (const x of [100, 900, 1100, 1900]) {
        it(`stays in the visited basin and within the local disc at x=${x}`, () => {
            const w = floraGarden();
            w.patchX[1] = x;
            w.patchY[1] = 100;
            expect(placeSeed(w, 1)).toBe(true);
            expect(w.point[0] < 1000).toBe(x < 1000);
            expect(w.point[0]).toBeGreaterThanOrEqual(x < 1000 ? 100 : 1100);
            expect(w.point[0]).toBeLessThanOrEqual(x < 1000 ? 900 : 1900);
            expect(w.point[1]).toBeGreaterThanOrEqual(100);
            expect(Math.hypot(w.point[0] - x, w.point[1] - 100)).toBeLessThanOrEqual(150 + 1e-9);
        });
    }

    it('retries within the disc when the first ring point is blocked', () => {
        const w = floraGarden({ placementTries: 50 });
        const preview = { seed: w.rng.flora.seed, s: w.rng.flora.s.slice() };
        const theta = nextFloat(preview) * TWO_PI;
        nextFloat(preview);
        w.obsX[0] = 500 + 150 * Math.cos(theta);
        w.obsY[0] = 500 + 150 * Math.sin(theta);
        w.obsRadius[0] = 1;
        expect(placeSeed(w, 1)).toBe(true);
        expect(Math.hypot(w.point[0] - w.obsX[0], w.point[1] - w.obsY[0])).toBeGreaterThanOrEqual(101);
        expect(w.rng.flora.s).not.toEqual(preview.s);
    });

    it('refuses a fully blocked disc after exactly the bounded draws without moving the point', () => {
        const w = floraGarden({ placementTries: 4 });
        w.obsX[0] = w.obsY[0] = 500;
        w.obsRadius[0] = 1000;
        w.point.set([42, 43]);
        const expected = { seed: w.rng.flora.seed, s: w.rng.flora.s.slice() };
        for (let i = 0; i < 8; i++) {
            nextFloat(expected);
        }
        expect(placeSeed(w, 1)).toBe(false);
        expect(Array.from(w.point)).toEqual([42, 43]);
        expect(w.rng.flora.s).toEqual(expected.s);
    });
    it('refuses clamping that would put the seed outside its local disc', () => {
        const w = floraGarden({ seedRadiusScale: 0.1, placementTries: 2 });
        w.patchX[1] = 0;
        expect(placeSeed(w, 1)).toBe(false);
    });

    it('refuses an empty-world configuration whose patch footprint cannot fit a basin', () => {
        const w = floraGarden({ foodPatchCount: 0, foodPatchRadius: 600, placementTries: 2 });
        expect(placeSeed(w, 1)).toBe(false);
    });
});
