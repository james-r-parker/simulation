import { describe, expect, it } from 'vitest';
import { welfordAdd, welfordMean, welfordSd } from '../../js/evo/welford.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';

/**
 * @param {number[]} xs values
 * @returns {{ mean: number, sd: number }} the naive two-pass mean and sample sd
 */
function naive(xs) {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const ss = xs.reduce((a, b) => a + (b - mean) ** 2, 0);
    return { mean, sd: xs.length < 2 ? 0 : Math.sqrt(ss / (xs.length - 1)) };
}

describe('welford', () => {
    it('is zero before any value', () => {
        const stats = new Float64Array(3);
        expect(welfordMean(stats, 0)).toBe(0);
        expect(welfordSd(stats, 0)).toBe(0);
    });

    it('has sd 0 for one value', () => {
        const stats = new Float64Array(3);
        welfordAdd(stats, 0, 5);
        expect(welfordMean(stats, 0)).toBe(5);
        expect(welfordSd(stats, 0)).toBe(0);
    });

    it('uses the n - 1 sample sd', () => {
        const stats = new Float64Array(3);
        welfordAdd(stats, 0, 2);
        welfordAdd(stats, 0, 4);
        expect(welfordSd(stats, 0)).toBeCloseTo(Math.SQRT2, 12);
    });

    it('matches a naive two-pass mean and sd on random values', () => {
        const rng = createRng(5);
        const xs = Array.from({ length: 500 }, () => nextFloat(rng) * 1000 - 300);
        const stats = new Float64Array(3);
        for (const x of xs) {
            welfordAdd(stats, 0, x);
        }
        const ref = naive(xs);
        expect(stats[0]).toBe(500);
        expect(welfordMean(stats, 0)).toBeCloseTo(ref.mean, 9);
        expect(welfordSd(stats, 0)).toBeCloseTo(ref.sd, 9);
    });

    it('keeps accumulators at different offsets apart', () => {
        const stats = new Float64Array(9);
        welfordAdd(stats, 3, 10);
        welfordAdd(stats, 6, 1);
        welfordAdd(stats, 6, 3);
        expect(welfordMean(stats, 0)).toBe(0);
        expect(welfordMean(stats, 3)).toBe(10);
        expect(welfordMean(stats, 6)).toBe(2);
    });
});
