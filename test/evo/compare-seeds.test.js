import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_SEEDS, METRIC_MIN_SEEDS, minSeedsFor } from '../../js/evo/compare-seeds.js';
import { MIN_SEEDS } from '../../js/evo/compare.js';

describe('minSeedsFor', () => {
    it('gives 32 for the four noisy metrics', () => {
        for (const metric of [
            'eval.floor_episodes',
            'eval.lineages_alive',
            'eval.lineage_turnover',
            'eval.predator_share_cv',
        ]) {
            expect(minSeedsFor(metric)).toBe(32);
        }
        expect(Object.keys(METRIC_MIN_SEEDS)).toHaveLength(4);
    });

    it('gives the default 16 for every other metric, including unknown and inherited names', () => {
        expect(DEFAULT_MIN_SEEDS).toBe(16);
        expect(MIN_SEEDS).toBe(DEFAULT_MIN_SEEDS);
        for (const metric of ['eval.diversity', 'eval.qd_score', 'mystery', 'toString', 'constructor']) {
            expect(minSeedsFor(metric)).toBe(16);
        }
    });
});
