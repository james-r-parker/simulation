import { describe, expect, it } from 'vitest';
import { binomialTwoSidedP } from '../../js/evo/binomial.js';
import { MIN_PAIRS, compareYield } from '../../js/evo/yield-compare.js';

/**
 * @param {number[]} scores one score per offset, offsets 0, 8, 16, ...
 * @param {number} [from] the first offset
 * @returns {{offset: number, score: number}[]} an arm's runs
 */
const arm = (scores, from = 0) => scores.map((score, i) => ({ offset: from + i * 8, score }));

describe('compareYield', () => {
    it('reads better when most pairs rose by a margin the sign test and the interval both see', () => {
        const before = arm(Array(20).fill(1));
        const after = arm(
            Array(20)
                .fill(1)
                .map((s, i) => s + 0.5 + (i % 3) * 0.1),
        );
        const result = compareYield(before, after);
        expect(result).toMatchObject({ matched: 20, tied: 0, up: 20, down: 0, verdict: 'better' });
        expect(result.p).toBeCloseTo(binomialTwoSidedP(20, 20), 12);
        expect(result.interval.low).toBeGreaterThan(0);
        expect(result.meanDiff).toBeGreaterThan(0.5);
        expect(result.pairs[1]).toEqual({ offset: 8, before: 1, after: 1.6, diff: 0.6000000000000001 });
    });

    it('reads worse when most pairs fell', () => {
        const before = arm(Array(18).fill(2));
        const after = arm(Array(18).fill(1.5));
        expect(compareYield(before, after)).toMatchObject({ up: 0, down: 18, verdict: 'worse' });
    });

    it('reads no verdict for a mixed result, and leaves tied pairs out of the sign test but counts them as matched', () => {
        const before = arm(Array(16).fill(2));
        const after = arm([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 1, 3, 1, 2.5, 1.5]);
        const result = compareYield(before, after);
        expect(result).toMatchObject({ matched: 16, tied: 10, up: 3, down: 3, verdict: 'no verdict' });
        expect(result.p).toBe(1);
    });

    it('reads no verdict when the sign test is significant but the interval holds 0', () => {
        const before = arm(Array(20).fill(0));
        const after = arm([...Array(19).fill(0.01), -50]);
        const result = compareYield(before, after);
        expect(result.p).toBeLessThan(0.05);
        expect(result.interval.low).toBeLessThan(0);
        expect(result.verdict).toBe('no verdict');
    });

    it('does not flag a significant fall whose interval holds 0 as worse', () => {
        const before = arm(Array(20).fill(0));
        const after = arm([...Array(19).fill(-0.01), 50]);
        expect(compareYield(before, after).verdict).toBe('no verdict');
    });

    it('is `no verdict` when every pair is tied', () => {
        const result = compareYield(arm(Array(16).fill(4)), arm(Array(16).fill(4)));
        expect(result).toMatchObject({ tied: 16, up: 0, down: 0, p: 1, verdict: 'no verdict', meanDiff: 0 });
    });

    it('pairs by offset, reports the offsets present on one side only and sorts the pairs', () => {
        const before = [...arm(Array(16).fill(1)), { offset: 1000, score: 5 }].reverse();
        const after = [...arm(Array(16).fill(2)), { offset: 2000, score: 5 }];
        const result = compareYield(before, after);
        expect(result.matched).toBe(16);
        expect([result.onlyBefore, result.onlyAfter]).toEqual([[1000], [2000]]);
        expect(result.pairs.map((p) => p.offset)).toEqual(arm(Array(16).fill(0)).map((r) => r.offset));
    });

    it('sorts several unmatched offsets on each side', () => {
        const extra = (/** @type {number[]} */ offsets) => offsets.map((offset) => ({ offset, score: 1 }));
        const before = [...arm(Array(16).fill(1)), ...extra([3000, 1000, 2000])];
        const after = [...arm(Array(16).fill(2)), ...extra([6000, 5000, 4000])];
        const result = compareYield(before, after);
        expect([result.onlyBefore, result.onlyAfter]).toEqual([
            [1000, 2000, 3000],
            [4000, 5000, 6000],
        ]);
    });

    it(`refuses under ${MIN_PAIRS} matched offsets, tied pairs counted, with exit code 2`, () => {
        const few = () => compareYield(arm(Array(15).fill(1)), arm(Array(15).fill(2)));
        expect(few).toThrow(/at least 16 matched offsets, got 15/);
        expect(few).toThrowError(expect.objectContaining({ exitCode: 2 }));
        expect(() => compareYield(arm(Array(16).fill(1)), arm(Array(16).fill(2), 4))).toThrow(/got 0/);
        expect(() => compareYield(arm([1, 2, 3]), arm([1, 2, 4]), { minPairs: 3 })).not.toThrow();
    });

    it('refuses an arm with two runs at one offset', () => {
        const twice = [...arm(Array(16).fill(1)), { offset: 0, score: 9 }];
        expect(() => compareYield(twice, arm(Array(16).fill(1)))).toThrow(/two runs at offset 0/);
        expect(() => compareYield(arm(Array(16).fill(1)), twice)).toThrow(/the after arm/);
    });
});
