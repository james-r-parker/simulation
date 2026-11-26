// Source test of the pooled share family (metric-noise Phase 2): `eval.food_contact_bite_share_pooled`,
// `eval.carcass_hunter_share_pooled`, `eval.mating_share_pooled` and `eval.gap_never_share_pooled`, read on real runs and
// pooled by the report as a ratio of sums over seeds. A real run with nothing counted has zero exposure on all four.

import { describe, expect, it } from 'vitest';
import { buildReport } from '../../js/evo/report.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { pooledResult } from '../../js/evo/report-pooled.js';
import { createConfig } from '../../js/sim/config.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { bareObserver, EMPTY_WORLD } from './helpers/metrics-observer.js';
import { FORAGER, huntRun } from './helpers/hunt-scene.js';

const SHARES = [
    ['eval.food_contact_bite_share', 'eval.food_contact_bite_share_pooled'],
    ['eval.carcass_hunter_share', 'eval.carcass_hunter_share_pooled'],
    ['eval.mating_share', 'eval.mating_share_pooled'],
    ['eval.gap_never_share', 'eval.gap_never_share_pooled'],
];

/**
 * @param {Record<string, any>[]} perSeed one metrics record per seed
 * @returns {Record<string, any>} the report's metrics
 */
function pool(perSeed) {
    return buildReport({
        policy: 'p',
        fitnessName: 'v6',
        config: createConfig({ seed: 1 }),
        ticks: 100,
        seeds: perSeed.map((_, i) => i + 1),
        sha: 'abc',
        perSeed,
    }).metrics;
}

/** @param {number} mate @param {number} split @returns {Record<string, any>} the metrics of a bare observer with those births */
function births(mate, split) {
    const o = bareObserver();
    o.births[BORN_CAUSE.MATE] = mate;
    o.births[BORN_CAUSE.SPLIT] = split;
    return computeMetrics(o, EMPTY_WORLD);
}

describe('the pooled shares from a real run with nothing counted', () => {
    it.each(SHARES)('%s and its pooled twin are both null, the twin with zero exposure', (old, pooled) => {
        const { run, spawn } = huntRun({ over: { maturityTicks: 100000 } });
        spawn(FORAGER);
        run.tick();
        const m = run.metrics();
        expect(m[old].value).toBeNull();
        expect(m[pooled].value).toBeNull();
        expect([m[pooled].num, m[pooled].den]).toEqual([0, 0]);
        expect(m[pooled].reason).toBe(m[old].reason);
    });
});

describe('eval.mating_share_pooled on real observer births', () => {
    it('equals the old share on one seed', () => {
        const m = births(3, 9);
        expect(m['eval.mating_share_pooled']).toEqual({ value: 0.25, num: 3, den: 12 });
        expect(m['eval.mating_share_pooled']?.value).toBe(m['eval.mating_share']?.value);
    });

    it('pools seeds as a ratio of sums, a seed with no birth adds nothing, and an all-zero arm is null', () => {
        const metric = pool([births(1, 1), births(9, 1), births(0, 0)])['eval.mating_share_pooled'];
        expect(metric.values).toEqual([0.5, 0.9, null]);
        expect(metric.pooled).toEqual([
            { num: 1, den: 2 },
            { num: 9, den: 10 },
            { num: 0, den: 0 },
        ]);
        expect(metric.mean).toBe(10 / 12);
        expect(metric.mean).not.toBe(0.7);
        const empty = pool([births(0, 0), births(0, 0)])['eval.mating_share_pooled'];
        expect(empty.mean).toBeNull();
    });
});

describe('the other pooled shares pool as a ratio of sums', () => {
    it.each(SHARES.slice(0, 2).concat(SHARES.slice(3)))(
        '%s: the report reads the sums, not the mean of ratios',
        (old, pooled) => {
            const seeds = [
                { [old]: pooledResult(1, 1, 'none'), [pooled]: pooledResult(1, 1, 'none') },
                { [old]: pooledResult(0, 4, 'none'), [pooled]: pooledResult(0, 4, 'none') },
                { [old]: pooledResult(0, 0, 'none'), [pooled]: pooledResult(0, 0, 'none') },
            ];
            const metric = pool(seeds)[pooled];
            expect(metric.values).toEqual([1, 0, null]);
            expect(metric.mean).toBe(1 / 5);
        },
    );
});
