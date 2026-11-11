import { describe, expect, it } from 'vitest';
import { effectFloor, isShare, SHARE_MIN_EFFECT, statusOf } from '../../js/evo/compare-rules.js';

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
