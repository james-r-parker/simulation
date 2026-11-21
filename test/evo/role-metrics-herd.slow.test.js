// Gate 2 of fair-chase.md, "Before any training": the herd metrics against the planted stampede of role-budget.md Phase 5
// (docs/designs/metric-noise.md, Phase 6, T21). A herd startled toward a body in its path; the body stands (and is trampled) or
// runs for the nearer flank (and clears it), played under the eval observer (`playStampedeObserved`).

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { playStampedeObserved, playStartleObserved } from './helpers/role-scene-herd.js';

const DODGE = 'eval.herd_dodge_share';
const TRAMPLED = 'eval.trampled_share';
const RATE = 'eval.herd_stampede_rate';

describe('the herd metrics against a planted stampede', { timeout: scaleTimeout(60_000) }, () => {
    const runs = playStampedeObserved({ spec: 'forager', facing: 'herd', run: true });
    const stands = playStampedeObserved({ spec: 'forager', facing: 'herd', run: false });
    const doomed = playStampedeObserved({ spec: 'forager', facing: 'herd', run: false, energy: 40 });

    it('plants a body that clears the herd, one that is trampled and survives, and one that is trampled to death', () => {
        expect(runs.cleared).toBe(true);
        expect(runs.tramples).toBe(0);
        expect(stands.tramples).toBeGreaterThan(0);
        expect(stands.died).toBe(false);
        expect(doomed.died).toBe(true);
    });

    it('herd_dodge_share reads 1 for the body that clears the herd and 0 for the one it tramples', () => {
        expect(runs.metrics[DODGE].value).toBe(1);
        expect(stands.metrics[DODGE].value).toBe(0);
        expect(doomed.metrics[DODGE].value).toBe(0);
    });

    it('trampled_share is the deaths by trample over the deaths: 1 for the body that dies, no reading when none does', () => {
        expect(doomed.metrics[TRAMPLED].value).toBe(1);
        expect(runs.metrics[TRAMPLED].value).toBeNull();
        expect(stands.metrics[TRAMPLED].value).toBeNull();
    });

    it('herd_stampede_rate is the startles per 10000 ticks: a standing hunter starts them, a forager does not', () => {
        const hunter = playStartleObserved({ spec: 'predator', gap: 100, ticks: 400 });
        const forager = playStartleObserved({ spec: 'forager', gap: 100, ticks: 400 });
        expect(hunter.stampedes).toBeGreaterThan(0);
        expect(hunter.metrics[RATE].value).toBeCloseTo((hunter.stampedes / hunter.ticks) * 10000, 6);
        expect(forager.stampedes).toBe(0);
        expect(forager.metrics[RATE].value).toBe(0);
    });

    it('reads every herd metric of the role table', () => {
        for (const name of ROLE_METRICS.herd) {
            expect(Object.hasOwn(runs.metrics, name)).toBe(true);
        }
    });
});
