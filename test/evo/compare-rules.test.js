import { describe, expect, it } from 'vitest';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { thresholdReady, effectFloor, isShare, SHARE_MIN_EFFECT, statusOf } from '../../js/evo/compare-rules.js';

describe('statusOf', () => {
    it('reads the registry status of a registered metric', () => {
        expect(statusOf('eval.births_per_1k')).toBe('verified');
        expect(statusOf('eval.floor_episodes')).toBe('unverified');
    });

    it('does not gate a name outside the registry', () => {
        for (const name of ['bench.step_ms@500', 'browser.frame_p95_ms', 'eval.p90_fitness.all', 'nope']) {
            expect(statusOf(name), name).toBe('verified');
        }
    });
});

const DIFFERENCES = [
    'eval.hunter_conversion_gain',
    'eval.winter_band_shift',
    'eval.winter_patch_proximity',
    'eval.season_map_distance',
    'eval.herd_season_shift',
    'eval.refuge_prey_use_under_threat',
    'eval.refuge_episode_entry',
    'eval.cold_margin_use_under_threat',
    'eval.refuge_use_under_threat',
    'eval.mate_hunter_lean',
];

describe('effectFloor of a share difference (D6)', () => {
    it('scores the ten difference metrics, which go negative, with the relative floor and not the absolute share floor', () => {
        const floors = { minEffect: 0.05, shareMinEffect: SHARE_MIN_EFFECT };
        for (const name of DIFFERENCES) {
            expect(METRICS[/** @type {keyof typeof METRICS} */ (name)].unit, name).toBe('share difference');
            expect(isShare(name), name).toBe(false);
            expect(effectFloor(name, 0.4, floors), name).toBeCloseTo(0.02, 12);
            expect(effectFloor(name, 0.1, floors), name).toBeCloseTo(0.005, 12);
        }
    });
});

describe('effectFloor', () => {
    const floors = { minEffect: 0.05, shareMinEffect: SHARE_MIN_EFFECT };

    it('is absolute for a share and relative for the rest', () => {
        expect(isShare('eval.born_share')).toBe(true);
        expect(isShare('eval.births_per_1k')).toBe(false);
        expect(isShare('nope')).toBe(false);
        expect(effectFloor('eval.born_share', 0.98, floors)).toBe(0.02);
        expect(effectFloor('eval.births_per_1k', 20, floors)).toBeCloseTo(1, 12);
        expect(effectFloor('nope', 4, floors)).toBeCloseTo(0.2, 12);
    });
});

describe('thresholdReady', () => {
    it('needs the arithmetic test, the source test and a liveness read, and is false outside the registry', () => {
        expect(thresholdReady('eval.born_share')).toBe(true);
        expect(thresholdReady('nope')).toBe(false);
        expect(thresholdReady('bench.step_ms@500')).toBe(false);
        const live = { nullShare: 0, distinct: 3, report: 'r' };
        const entry = (
            /** @type {string} */ arithmetic,
            /** @type {string} */ source,
            /** @type {any} */ liveness,
        ) => ({
            tests: { arithmetic, source },
            liveness,
        });
        const metrics = {
            ok: entry('a.test.js', 's.test.js', live),
            noArithmetic: entry('', 's.test.js', live),
            noSource: entry('a.test.js', '', live),
            noLiveness: entry('a.test.js', 's.test.js', null),
        };
        expect(Object.keys(metrics).map((name) => thresholdReady(name, metrics))).toEqual([true, false, false, false]);
    });
});
