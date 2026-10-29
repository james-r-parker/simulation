// The scene metrics as a set: their names, their directions in the compare table and in the watch-intent list, and the
// reason each carries on a fresh observer. Each detector's value is tested beside its `scene-*.js` module.

import { describe, expect, it } from 'vitest';
import { metricDirection } from '../../js/evo/compare.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { SCENE_DIRECTIONS, sceneMetrics } from '../../js/evo/metrics-scenes.js';
import { intendedDirection } from '../../scripts/lib/watch-intent.mjs';
import { observed } from './helpers/observer-world.js';

describe('the scene metrics', () => {
    it('are the Detectors table names, and computeMetrics carries every one', () => {
        const names = Object.keys(sceneMetrics(observed().observer)).sort();
        expect(names).toEqual(Object.keys(SCENE_DIRECTIONS).sort());
        const all = computeMetrics(observed().observer, {});
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

    it('are null with a reason on a fresh observer, except the recolonisation count of a basins world', () => {
        const metrics = sceneMetrics(observed().observer);
        for (const [name, result] of Object.entries(metrics)) {
            expect(result.value, name).toBeNull();
            expect(result.reason, name).toBeTypeOf('string');
        }
        const basins = sceneMetrics(
            observed({
                terrainLayout: 'basins',
                obstacleCount: 0,
                worldWidth: 4000,
                worldHeight: 2000,
                refugeCount: 2,
                wallGaps: 1,
            }).observer,
        );
        expect(basins['eval.basin_recolonisations']).toEqual({ value: 0 });
    });

    it('name an intended direction for the watch metrics where lower is better', () => {
        expect(intendedDirection('eval.chase_giveup_share')).toBe('lower');
        expect(intendedDirection('eval.gap_never_share')).toBe('lower');
        expect(intendedDirection('eval.chase_catch_share')).toBe('higher');
    });
});
