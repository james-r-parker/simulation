import { describe, expect, it } from 'vitest';
import { createRng, nextGaussian } from '../js/sim/rng.js';
import { clusterBca, partialSpearman, spearman } from '../scripts/lib/reflex-stats.mjs';

describe('partialSpearman', () => {
    it('removes the part of the correlation that the control explains', () => {
        // two groups: within each, x and y are unrelated; across them both rise
        const x = [1, 2, 3, 4, 11, 12, 13, 14];
        const y = [4, 1, 3, 2, 14, 11, 13, 12];
        const control = [0, 0, 0, 0, 1, 1, 1, 1];
        expect(spearman(x, y)).toBeGreaterThan(0.6);
        expect(Math.abs(partialSpearman(x, y, control))).toBeLessThan(0.5);
    });

    it('equals the plain rho for a constant control', () => {
        const x = [3, 1, 4, 1.5, 9, 2.6];
        const y = [2, 7, 1, 8, 2.8, 1.8];
        expect(partialSpearman(x, y, [5, 5, 5, 5, 5, 5])).toBeCloseTo(spearman(x, y), 12);
    });

    it('is a perfect correlation when both rise together within each group', () => {
        const x = [1, 2, 3, 10, 20, 30];
        const y = [5, 6, 7, 1, 2, 3];
        expect(partialSpearman(x, y, [0, 0, 0, 1, 1, 1])).toBeCloseTo(1, 12);
    });
});

describe('clusterBca', () => {
    /**
     * @param {number} clusters how many clusters
     * @param {number} noise the spread of y around x
     * @returns {{x: number, y: number, c: string}[]} rows, five per cluster
     */
    function rows(clusters, noise) {
        const rng = createRng(11);
        return Array.from({ length: clusters * 5 }, (_, i) => {
            const x = i;
            return { x, y: x + noise * nextGaussian(rng), c: `c${Math.floor(i / 5)}` };
        });
    }
    const stat = (/** @type {{x: number, y: number}[]} */ part) =>
        spearman(
            part.map((r) => r.x),
            part.map((r) => r.y),
        );

    it('gives an interval above 0 for a clear relation', () => {
        const result = clusterBca(rows(12, 4), { stat, cluster: (r) => r.c, resamples: 500 });
        expect(result.estimate).toBeGreaterThan(0.8);
        expect(result.low).toBeGreaterThan(0);
        expect(result.high).toBeLessThanOrEqual(1);
        expect(result.low).toBeLessThanOrEqual(result.estimate);
    });

    it('gives an interval that includes 0 for no relation', () => {
        const rng = createRng(5);
        const noise = Array.from({ length: 60 }, (_, i) => ({ x: i, y: nextGaussian(rng), c: `c${i % 12}` }));
        const result = clusterBca(noise, { stat, cluster: (r) => r.c, resamples: 500 });
        expect(result.low).toBeLessThan(0);
        expect(result.high).toBeGreaterThan(0);
    });

    it('replays for a seed and changes with another', () => {
        const data = rows(10, 6);
        const a = clusterBca(data, { stat, cluster: (r) => r.c, resamples: 300, seed: 1 });
        expect(clusterBca(data, { stat, cluster: (r) => r.c, resamples: 300, seed: 1 })).toEqual(a);
        expect(clusterBca(data, { stat, cluster: (r) => r.c, resamples: 300, seed: 2 })).not.toEqual(a);
    });

    it('has no interval under three clusters, or when the statistic is undefined', () => {
        const few = clusterBca(rows(2, 1), { stat, cluster: (r) => r.c, resamples: 100 });
        expect(Number.isNaN(few.low)).toBe(true);
        expect(Number.isFinite(few.estimate)).toBe(true);
        const flat = rows(5, 1).map((r) => ({ ...r, y: 1 }));
        expect(Number.isNaN(clusterBca(flat, { stat, cluster: (r) => r.c, resamples: 100 }).estimate)).toBe(true);
    });
});
