import { describe, expect, it } from 'vitest';
import { mean, none, ok, per1k, quantile, ranks, share, spearman, stddev } from '../../js/evo/metrics-stats.js';

describe('metrics-stats', () => {
    it('ranks with ties sharing the mean position, and correlates ranks', () => {
        expect(Array.from(ranks([30, 10, 20, 20]))).toEqual([4, 1, 2.5, 2.5]);
        expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12);
        expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
        expect(spearman([1, 2, 3], [5, 5, 5])).toBeNaN();
    });

    it('builds a share, or a null with the reason when the whole is 0', () => {
        expect(share(1, 4, 'none')).toEqual({ value: 0.25 });
        expect(share(0, 0, 'none')).toEqual({ value: null, reason: 'none' });
    });

    it('builds results', () => {
        expect(ok(2)).toEqual({ value: 2 });
        expect(none('why')).toEqual({ value: null, reason: 'why' });
    });

    it('computes mean and population standard deviation', () => {
        expect(mean([1, 2, 3, 6])).toBe(3);
        expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    });

    it('interpolates quantiles between order statistics', () => {
        expect(quantile([5], 0.9)).toBe(5);
        expect(quantile([3, 1, 2], 0.5)).toBe(2);
        expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
        expect(quantile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9)).toBeCloseTo(90, 12);
        expect(quantile([0, 10], 0.9)).toBeCloseTo(9, 12);
    });

    it('scales per 1000 agent-ticks and is null without agent-ticks', () => {
        expect(per1k(5, 2000)).toEqual({ value: 2.5 });
        expect(per1k(5, 0).value).toBeNull();
        expect(per1k(5, 0).reason).toBeTypeOf('string');
    });
});
