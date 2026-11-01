// The scene metrics as a set: their names, their directions in the compare table and in the watch-intent list, and the
// reason each carries on a fresh observer. Each detector's value is tested beside its `scene-*.js` module.

import { describe, expect, it } from 'vitest';
import { metricDirection } from '../../js/evo/compare.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { SCENE_DIRECTIONS, sceneMetrics } from '../../js/evo/metrics-scenes.js';
import { intendedDirection } from '../../scripts/lib/watch-intent.mjs';
import { observed } from './helpers/observer-world.js';
import { EMPTY_WORLD } from './helpers/metrics-observer.js';

describe('the scene metrics', () => {
    it('are the Detectors table names, and computeMetrics carries every one', () => {
        const { observer, world } = observed();
        const names = Object.keys(sceneMetrics(observer, world)).sort();
        expect(names).toEqual(Object.keys(SCENE_DIRECTIONS).sort());
        const all = computeMetrics(observed().observer, EMPTY_WORLD);
        for (const name of names) {
            expect(all, name).toHaveProperty([name]);
        }
    });

    it('have the table directions in the compare table: the patch pair has one, the rest are watch', () => {
        expect(metricDirection('eval.patch_stay_depleted')).toBe('lower');
        expect(metricDirection('eval.patch_leave_depleted')).toBe('higher');
        for (const [name, direction] of Object.entries(SCENE_DIRECTIONS)) {
            expect(metricDirection(name), name).toBe(direction);
        }
        expect(metricDirection('eval.hunt_abort_rate')).toBe('watch');
    });

    it('are null with a reason on a fresh observer, except the counts read off the world', () => {
        const { observer, world } = observed({ worldWidth: 4000, worldHeight: 2000, refugeCount: 2 });
        const metrics = sceneMetrics(observer, world);
        const counts = ['eval.basin_recolonisations', 'eval.predators_at_end', 'eval.prey_types_at_end'];
        for (const [name, result] of Object.entries(metrics)) {
            if (counts.includes(name)) {
                expect(result).toEqual({ value: 0 });
            } else {
                expect(result.value, name).toBeNull();
                expect(result.reason, name).toBeTypeOf('string');
            }
        }
    });

    it('name an intended direction for the watch metrics where lower is better', () => {
        expect(intendedDirection('eval.chase_giveup_share')).toBe('lower');
        expect(intendedDirection('eval.gap_never_share')).toBe('lower');
        expect(intendedDirection('eval.chase_catch_share')).toBe('higher');
        expect(intendedDirection('eval.toxic_death_share')).toBe('lower');
        expect(intendedDirection('eval.sick_share')).toBe('lower');
        expect(intendedDirection('eval.toxic_avoidance')).toBe('higher');
        expect(intendedDirection('eval.pollination_rate')).toBe('higher');
        expect(intendedDirection('eval.flora_hue_spread')).toBe('higher');
        expect(intendedDirection('eval.flora_patch_pool_full_share')).toBe('lower');
    });
});
