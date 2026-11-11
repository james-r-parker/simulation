import { describe, expect, it } from 'vitest';
import { cv, median, seedGuards, traceRow } from '../scripts/capacity-traces.mjs';

/**
 * @param {number[][]} pops per seed populations at 5000-tick samples (the first is before burn-in)
 * @param {number[]} ends hunters alive at the end per seed
 * @returns {Record<string, any>} a minimal report
 */
function report(pops, ends) {
    return {
        seeds: pops.map((_, i) => i + 1),
        traces: pops.map((pop) => ({ interval: 5000, pop, prey: pop.map((p) => p - 10), spec: [pop.at(-1)] })),
        metrics: { 'eval.predators_at_end': { values: ends }, 'eval.food_energy_per_1k': { mean: 500 } },
    };
}

describe('capacity-traces', () => {
    it('takes medians and the coefficient of variation', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([1, 2, 3, 4])).toBe(2.5);
        expect(cv([2, 2, 2])).toBe(0);
        expect(cv([1, 3])).toBeCloseTo(0.5, 12);
    });

    it('reads lowest population after burn-in only', () => {
        const row = traceRow(
            'a',
            report(
                [
                    [5, 200, 30],
                    [5, 120, 150],
                ],
                [1, 0],
            ),
        );
        expect(row).toMatchObject({ medianLowest: 75, under40: 1, seeds: 2, alive: 1 });
        expect(row.fewPreyShare).toBeCloseTo(1 / 4, 12);
    });

    it('prints the held guard of an arm against the reference', () => {
        const six = (/** @type {number} */ low) => Array.from({ length: 6 }, () => [5, 200, low]);
        const ones = [1, 1, 1, 1, 1, 1];
        expect(seedGuards(report(six(200), ones), report(six(20), ones))).toContain('held worse (6/0');
    });
});
