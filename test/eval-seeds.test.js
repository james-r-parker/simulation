import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng, nextInt } from '../js/sim/rng.js';
import { pickSeeds } from '../scripts/eval.mjs';

const SEEDS = JSON.parse(readFileSync(new URL('../evals/seeds.json', import.meta.url), 'utf8'));

// Seeds 1-32 name the committed reports in evals/, so they never change.
const FIRST_32 = [
    313056, 337535, 612370, 446985, 639124, 888035, 654502, 275725, 851784, 318983, 224570, 833553, 513404, 371179,
    785870, 95573, 190896, 587535, 50850, 285273, 45220, 521459, 912822, 481629, 573144, 941591, 32714, 192673, 200460,
    597883, 174238, 553445,
];

describe('evals/seeds.json', () => {
    it('holds 64 distinct seeds', () => {
        expect(SEEDS).toHaveLength(64);
        expect(new Set(SEEDS).size).toBe(64);
    });

    it('keeps the first 32 values unchanged', () => {
        expect(SEEDS.slice(0, 32)).toEqual(FIRST_32);
    });

    it('draws seeds 33 to 64 as 32 values of nextInt(rng, 1000000) from createRng(64)', () => {
        const rng = createRng(64);
        const drawn = Array.from({ length: 32 }, () => nextInt(rng, 1000000));
        expect(SEEDS.slice(32)).toEqual(drawn);
    });

    it('gives pickSeeds the first n by default and the calibration window with an offset of 32', () => {
        expect(pickSeeds(16, 0)).toEqual(FIRST_32.slice(0, 16));
        expect(pickSeeds(32, 0)).toEqual(FIRST_32);
        expect(pickSeeds(32, 32)).toEqual(SEEDS.slice(32));
    });
});
