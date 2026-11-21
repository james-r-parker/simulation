// The detector list: each detector is named once, and the lean ones are among them.

import { describe, expect, it } from 'vitest';
import { createSceneLayer, DETECTORS, LEAN_DETECTORS } from '../../js/evo/detectors.js';
import { lifeWorld } from '../sim/helpers/life-world.js';

describe('DETECTORS', () => {
    it('names each detector once, and the lean ones are among them', () => {
        const names = DETECTORS.map((detector) => detector.name);
        expect(new Set(names).size).toBe(names.length);
        for (const lean of LEAN_DETECTORS) {
            expect(DETECTORS).toContain(lean);
        }
    });

    it('builds a state for every detector, and for the lean ones only on a lean observer', () => {
        const { config } = lifeWorld();
        const full = createSceneLayer(config, { runTicks: 100 });
        expect(Object.keys(full.scenes)).toEqual(DETECTORS.map((detector) => detector.name));
        expect(full.plan.list).toBe(DETECTORS);
        const lean = createSceneLayer(config, { lean: true });
        expect(Object.keys(lean.scenes).sort()).toEqual(['style', 'terrain']);
        expect(lean.plan.list).toBe(LEAN_DETECTORS);
    });

    it('runs approach before the detectors that read its per-tick state', () => {
        // The sprint detector reads `scenes.approach.phase`, which the approach detector rewrites each tick, and
        // approach and stillness read each other at a death (docs/notes/2026-11.md, 2026-11-21 "Detector order is
        // behaviour"). Moving approach after any of them moves `eval.chase_sprint_lift`.
        const index = (/** @type {string} */ name) => DETECTORS.findIndex((detector) => detector.name === name);
        const approach = index('approach');
        expect(approach).toBeGreaterThanOrEqual(0);
        for (const later of ['stillness', 'sprint', 'kinematics']) {
            expect(
                approach,
                `approach must run before ${later} (docs/notes/2026-11.md, 2026-11-21 "Detector order is behaviour")`,
            ).toBeLessThan(index(later));
        }
    });
});
