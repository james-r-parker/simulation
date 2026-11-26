// The headline pick of the metric registry (docs/designs/metric-noise.md, Phase 5, T16).

import { describe, expect, it } from 'vitest';
import { GUARD_METRICS } from '../../../js/evo/keep-rule.js';
import {
    WORLD_HEADLINES,
    withHeadlines,
    headlineCandidates,
    pickHeadlines,
    scenesWithoutHeadline,
} from '../../../js/evo/metric-registry/headlines.js';
import { METRICS } from '../../../js/evo/metric-registry/index.js';
import { PRINCIPLE_SCENES } from '../../../js/evo/metric-registry/scenes.js';
import { isFlat, metricStatus, mdeAgainstBar } from '../../../js/evo/metric-registry/status.js';

/** @param {object} over @returns {any} a verified, live, scene-tagged entry with a measured power read */
function fake(over = {}) {
    return {
        unit: 'share',
        scenes: ['Abort'],
        deprecated: null,
        expectedFlat: null,
        tests: { arithmetic: 'a', source: 's' },
        liveness: { nullShare: 0, distinct: 50, offModeShare: 1 },
        power: { mde64: 0.05, referenceMean: 0.4 },
        minSeeds: 16,
        ...over,
    };
}

describe('mdeAgainstBar', () => {
    it('reads a share against 0.05, a mean near 0 against 0.1 absolute, else against 20% of the mean', () => {
        expect(mdeAgainstBar('share', 0.03, 0.4)).toEqual({ change: 0.03, bar: 0.05 });
        expect(mdeAgainstBar('trend', 0.5, 0.1).bar).toBe(0.1);
        expect(mdeAgainstBar('ticks', 0.5, 0.005).change).toBeCloseTo(0.0025);
        expect(mdeAgainstBar('ticks', 0.1, 100)).toEqual({ change: 0.1, bar: 0.2 });
    });
});

describe('headlineCandidates', () => {
    it('keeps a verified, live detector and drops flat, unverified, null-heavy and too-coarse ones', () => {
        const entries = {
            good: fake(),
            flat: fake({ expectedFlat: 'why', liveness: { nullShare: 0, distinct: 1, offModeShare: 0 } }),
            unverified: fake({ minSeeds: null }),
            sparse: fake({ liveness: { nullShare: 0.6, distinct: 5, offModeShare: 1 } }),
            coarse: fake({ power: { mde64: 0.05, referenceMean: 0.04 } }),
            elsewhere: fake({ scenes: ['Refuge'] }),
        };
        expect(headlineCandidates(entries, 'Abort').map((c) => c.name)).toEqual(['good']);
    });

    it('orders by the share of the bar used, then the change relative to the mean, then the name', () => {
        const entries = {
            b: fake({ power: { mde64: 0.03, referenceMean: 0.3 } }),
            a: fake({ power: { mde64: 0.03, referenceMean: 0.3 } }),
            wide: fake({ power: { mde64: 0.05, referenceMean: 0.9 } }),
            tight: fake({ power: { mde64: 0.03, referenceMean: 0.9 } }),
        };
        expect(headlineCandidates(entries, 'Abort').map((c) => c.name)).toEqual(['tight', 'a', 'b', 'wide']);
    });
});

describe('pickHeadlines', () => {
    it('gives each scene its best candidate and no scene without one', () => {
        const picked = pickHeadlines({ one: fake(), two: fake({ scenes: ['Refuge'] }) }, [
            'Abort',
            'Refuge',
            'Boom and bust',
        ]);
        expect(picked).toEqual({ Abort: 'one', Refuge: 'two' });
    });
});

describe('withHeadlines', () => {
    const world = Object.fromEntries(WORLD_HEADLINES.map((name) => [name, fake({ scenes: undefined })]));

    it('flags each scene pick `scene` and each world metric `world`, and no other entry', () => {
        const flagged = withHeadlines(
            { ...world, pick: fake(), other: fake({ power: { mde64: 0.05, referenceMean: 0.3 } }) },
            ['Abort'],
        );
        expect(flagged.pick.headline).toBe('scene');
        expect(flagged.other.headline).toBeUndefined();
        expect(/** @type {any} */ (flagged)[WORLD_HEADLINES[0]].headline).toBe('world');
    });

    it('throws when a world headline has no entry', () => {
        expect(() => withHeadlines({ pick: fake() }, ['Abort'])).toThrow('unknown metric eval.food_energy_per_1k');
    });
});

describe('headlineCandidates without a measurement', () => {
    it('skips an entry with no power read, no liveness read or no mean', () => {
        const entries = {
            noPower: fake({ power: null }),
            noLiveness: fake({ liveness: null }),
            zeroMean: fake({ power: { mde64: 0.05, referenceMean: 0 } }),
            noMde: fake({ power: { mde64: null, referenceMean: 0.4 } }),
        };
        expect(headlineCandidates(entries, 'Abort')).toEqual([]);
    });
});

describe('the committed headlines', () => {
    const flagged = (/** @type {string} */ kind) =>
        Object.entries(METRICS)
            .filter(([, entry]) => entry.headline === kind)
            .map(([name]) => name);

    it('are the pick recomputed from the registry (no hand-picked drift)', () => {
        const unflagged = Object.fromEntries(
            Object.entries(METRICS).map(([n, e]) => [n, { ...e, headline: undefined }]),
        );
        expect(flagged('scene').sort()).toEqual(Object.values(pickHeadlines(unflagged, PRINCIPLE_SCENES)).sort());
    });

    it('hold at most one per scene', () => {
        for (const scene of PRINCIPLE_SCENES) {
            const mine = flagged('scene').filter((name) =>
                METRICS[/** @type {keyof typeof METRICS} */ (name)].scenes?.includes(scene),
            );
            expect(mine.length, scene).toBeLessThanOrEqual(1);
        }
    });

    it('are verified, not flat, and live on most seeds', () => {
        for (const name of [...flagged('scene'), ...flagged('world')]) {
            const entry = METRICS[/** @type {keyof typeof METRICS} */ (name)];
            expect(metricStatus(entry), name).toBe('verified');
            expect(isFlat(entry), name).toBe(false);
            expect(entry.liveness?.nullShare ?? 1, name).toBeLessThan(0.5);
        }
    });

    it('name the three world metrics and the keep rule guard as world headlines', () => {
        expect(WORLD_HEADLINES).toEqual([
            'eval.food_energy_per_1k',
            'eval.births_per_1k',
            'eval.fed_median_lifespan',
            ...GUARD_METRICS,
        ]);
        expect(flagged('world').sort()).toEqual([...WORLD_HEADLINES].sort());
    });

    it('leave the scenes with no qualifying detector without a headline', () => {
        const none = scenesWithoutHeadline(METRICS, PRINCIPLE_SCENES);
        expect(none).toEqual(["Call, or don't", 'Scavenge', 'Something unnamed']);
    });
});
