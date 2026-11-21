import { describe, expect, it } from 'vitest';
import { mutateWeights, WEIGHT_CLAMP } from '../../js/evo/mutation.js';
import { knockOutUnit } from '../../js/evo/unit-knockout.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { KNOCKOUT_LEAK_GENE } from '../../js/sim/traits.js';

const config = createConfig({ brainHidden: 32 });
const layout = brainLayout(config);

describe('knockOutUnit', () => {
    it('rate 0 draws nothing and leaves the row and RNG stream untouched', () => {
        const row = new Float32Array(layout.weightCount);
        const before = row.slice();
        const rng = createRng(17);
        const ref = fork(createRng(17), 'ref');
        const rngFork = fork(rng, 'ref');
        expect(knockOutUnit(row, layout, rngFork, 0)).toBe(-1);
        expect(row).toEqual(before);
        expect(nextFloat(rngFork)).toBe(nextFloat(ref));
    });

    it('rate 1 knocks exactly one unit and changes no other gene', () => {
        const row = new Float32Array(layout.weightCount).fill(0.5);
        const before = row.slice();
        const unit = knockOutUnit(row, layout, createRng(23), 1);
        expect(unit).toBeGreaterThanOrEqual(0);
        expect(unit).toBeLessThan(layout.hidden);
        expect(row[layout.leakStart + unit]).toBe(KNOCKOUT_LEAK_GENE);
        for (let i = 0; i < row.length; i++) {
            if (i !== layout.leakStart + unit) {
                expect(row[i]).toBe(before[i]);
            }
        }
    });

    it('knocks every unit uniformly over 3200 draws at rate 1 (chi-square bound)', () => {
        const counts = new Array(layout.hidden).fill(0);
        const row = new Float32Array(layout.weightCount);
        const rng = createRng(41);
        const draws = 3200;
        for (let i = 0; i < draws; i++) {
            const unit = knockOutUnit(row, layout, rng, 1);
            counts[unit] += 1;
        }
        const expected = draws / layout.hidden;
        expect(counts.every((c) => c > 0)).toBe(true);
        const chiSquare = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
        expect(chiSquare).toBeLessThan(55); // df = 31, p < 0.005 is 55.0
    });

    it('knocking an already-knocked unit leaves the row equal', () => {
        const row = new Float32Array(layout.weightCount);
        const small = brainLayout(createConfig({ brainHidden: 1 }));
        expect(knockOutUnit(row, small, createRng(1), 1)).toBe(0);
        const afterFirst = row.slice();
        expect(knockOutUnit(row, small, createRng(2), 1)).toBe(0);
        expect(row).toEqual(afterFirst);
    });

    it('returns -1 when the float draw is at or above a fractional rate', () => {
        const row = new Float32Array(layout.weightCount);
        const rng = createRng(99);
        const results = Array.from({ length: 40 }, () => knockOutUnit(row, layout, rng, 0.5));
        expect(results.some((r) => r === -1)).toBe(true);
        expect(results.some((r) => r >= 0)).toBe(true);
    });

    it('mutateWeights at rate 1 reverts a knocked leak gene to -WEIGHT_CLAMP (-4)', () => {
        const row = new Float32Array(layout.weightCount);
        const unit = knockOutUnit(row, layout, createRng(5), 1);
        expect(row[layout.leakStart + unit]).toBe(KNOCKOUT_LEAK_GENE);
        mutateWeights(row, 0.05, createRng(6), { traitStart: layout.traitStart, rate: 1 });
        expect(row[layout.leakStart + unit]).toBe(-WEIGHT_CLAMP);
    });
});
