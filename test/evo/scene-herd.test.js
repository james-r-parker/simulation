import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { createHerdScene, herdMetrics, noteHerdDeath, trackHerd } from '../../js/evo/scene-herd.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { metricDirection } from '../../js/evo/compare.js';
import { SCENE_DIRECTIONS } from '../../js/evo/metrics-scenes.js';
import { intendedDirection } from '../../scripts/lib/watch-intent.mjs';

function sceneWorld() {
    return {
        tick: BURN_IN_TICKS + 1,
        config: { herdWalkSpeed: 1, herdRadius: 20 },
        alive: Uint8Array.of(1),
        genomeId: Uint32Array.of(11),
        x: Float64Array.of(200),
        y: Float64Array.of(100),
        size: Float64Array.of(10),
        herdAlive: Uint8Array.of(1),
        herdId: Uint32Array.of(51),
        herdX: Float64Array.of(100),
        herdY: Float64Array.of(100),
        herdVx: Float64Array.of(5),
        herdVy: Float64Array.of(0),
        herdTotals: Float64Array.of(30, 0),
        floraIntake: Float64Array.of(70),
    };
}

describe('scene-herd detectors', () => {
    it('registers the three Phase 1 detector directions', () => {
        const names = Object.keys(SCENE_DIRECTIONS);
        expect(names).toContain('eval.trampled_share');
        expect(names).toContain('eval.dodge_skill');
        expect(names).toContain('eval.herd_grazed_share');
        expect(metricDirection('eval.trampled_share')).toBe('watch');
        expect(intendedDirection('eval.trampled_share')).toBe('lower');
    });

    it('counts a lane approach as clear when the blob leaves before contact', () => {
        const scene = createHerdScene(1);
        const world = sceneWorld();
        trackHerd(scene, world);
        expect(scene.episodeOpen[0]).toBe(1);
        world.tick++;
        world.y[0] = 200;
        trackHerd(scene, world);
        expect(scene.episodesClear).toBe(1);
        expect(herdMetrics(scene)['eval.dodge_skill'].value).toBe(1);
    });

    it('counts contact as a hit and uses only post-burn-in deaths for trample share', () => {
        const scene = createHerdScene(1);
        const world = sceneWorld();
        trackHerd(scene, world);
        world.tick++;
        world.x[0] = 110;
        trackHerd(scene, world);
        noteHerdDeath(scene, { tick: BURN_IN_TICKS, slot: 0, genomeId: 11, cause: DEATH_CAUSE.TRAMPLED, herdId: 51 });
        noteHerdDeath(scene, {
            tick: BURN_IN_TICKS + 1,
            slot: 0,
            genomeId: 11,
            cause: DEATH_CAUSE.TRAMPLED,
            herdId: 51,
        });
        expect(scene.episodesHit).toBe(1);
        expect(herdMetrics(scene)['eval.trampled_share'].value).toBe(1);
    });

    it('computes grazing share from counter deltas and returns null without meals', () => {
        const scene = createHerdScene(1);
        const world = sceneWorld();
        trackHerd(scene, world);
        expect(herdMetrics(scene)['eval.herd_grazed_share'].value).toBeCloseTo(30 / 100);
        expect(herdMetrics(createHerdScene(1))['eval.herd_grazed_share'].value).toBeNull();
    });
});
