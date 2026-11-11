import { describe, expect, it } from 'vitest';
import { rank, renderRank, rowOf } from '../scripts/capacity-rank.mjs';

/**
 * @param {number[]} lows each seed's lowest population
 * @param {number[]} ends hunters alive at the end per seed
 * @param {number} cap the cap share mean
 * @returns {Record<string, any>} a minimal report
 */
function report(lows, ends, cap) {
    return {
        seeds: lows.map((_, i) => i),
        traces: lows.map((low) => ({ interval: 5000, pop: [500, low, 500] })),
        metrics: { 'eval.predators_at_end': { values: ends }, 'eval.cap_share': { mean: cap } },
    };
}

describe('capacity-rank', () => {
    it('counts held and alive seeds and ranks by held, alive, then cap share', () => {
        const a = rowOf('a', report([150, 50], [1, 1], 0.3));
        const b = rowOf('b', report([150, 120], [0, 1], 0.2));
        const c = rowOf('c', report([150, 120], [0, 1], 0.1));
        expect(a).toMatchObject({ held: 1, alive: 2 });
        expect(rank([a, b, c]).map((r) => r.name)).toEqual(['c', 'b', 'a']);
        expect(renderRank(rank([a, b, c]))).toContain('| 1 | c | 2/2 | 1/2 | 0.100 |');
    });
});
