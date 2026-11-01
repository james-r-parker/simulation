import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { createHerdScene, noteHerdDeath, trackHerd } from '../../js/evo/scene-herd.js';
import { herdMetrics } from '../../js/evo/scene-herd-metrics.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { metricDirection } from '../../js/evo/compare.js';
import { SCENE_DIRECTIONS } from '../../js/evo/metrics-scenes.js';
import { intendedDirection } from '../../scripts/lib/watch-intent.mjs';

function sceneWorld() {
    return {
        tick: BURN_IN_TICKS + 1,
        config: {
            herdWalkSpeed: 1,
            herdRadius: 20,
            herdCount: 1,
            maxAgents: 1,
            worldWidth: 1000,
            specialisations: { forager: 0, predator: 1, reproducer: 2, scout: 3, defender: 4 },
        },
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
        herdGroup: Uint8Array.of(0),
        herdTotals: Float64Array.of(30, 0),
        floraIntake: Float64Array.of(70),
        foodEatenBySpec: Float64Array.of(70, 0, 0, 0, 0),
        herdCarcassEatenBySpec: new Float64Array(5),
        events: { data: new Float64Array(EVENT_STRIDE), count: 0 },
    };
}

/** @param {Record<string, any>} scene */
function emptyMetrics(scene) {
    return herdMetrics(
        scene,
        { eaten: 0, eatenByHunters: 0 },
        { intent: { hunterSpec: Uint8Array.of(0, 1, 0, 0, 0), run: { huntBiteDeliberate: 0, huntBiteChance: 0 } } },
    );
}

describe('scene-herd detectors', () => {
    it('registers the three Phase 1 detector directions', () => {
        const names = Object.keys(SCENE_DIRECTIONS);
        expect(names).toContain('eval.trampled_share');
        expect(names).toContain('eval.dodge_skill');
        expect(names).toContain('eval.herd_grazed_share');
        expect(names).toContain('eval.trample_unavoidable_share');
        expect(names).toContain('eval.herd_carcass_meal_share');
        expect(names).toContain('eval.herd_carcass_share.predator');
        expect(metricDirection('eval.trampled_share')).toBe('watch');
        expect(intendedDirection('eval.trampled_share')).toBe('lower');
        expect(intendedDirection('eval.trample_unavoidable_share')).toBe('lower');
        expect(intendedDirection('eval.herd_carcass_share.predator')).toBe('lower');
    });

    it('counts a lane approach as clear when the blob leaves before contact', () => {
        const scene = createHerdScene(sceneWorld().config);
        const world = sceneWorld();
        trackHerd(scene, world);
        expect(scene.episodeOpen[0]).toBe(1);
        world.tick++;
        world.y[0] = 200;
        trackHerd(scene, world);
        expect(scene.episodesClear).toBe(1);
        expect(emptyMetrics(scene)['eval.dodge_skill'].value).toBe(1);
    });

    it('counts contact as a hit and uses only post-burn-in deaths for trample share', () => {
        const scene = createHerdScene(sceneWorld().config);
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
        expect(emptyMetrics(scene)['eval.trampled_share'].value).toBe(1);
    });

    it('computes grazing share from counter deltas and returns null without meals', () => {
        const scene = createHerdScene(sceneWorld().config);
        const world = sceneWorld();
        trackHerd(scene, world);
        expect(emptyMetrics(scene)['eval.herd_grazed_share'].value).toBeCloseTo(30 / 100);
        expect(emptyMetrics(createHerdScene(sceneWorld().config))['eval.herd_grazed_share'].value).toBeNull();
    });

    it('records seeded stampede rates, herd checkpoints, crossings and recolonisations', () => {
        const scene = createHerdScene(sceneWorld().config);
        const world = sceneWorld();
        const checkpoint = Math.ceil((BURN_IN_TICKS + 1) / 1000) * 1000;
        world.tick = checkpoint;
        world.events.data[0] = EVENT_TYPE.HERD_STAMPEDE;
        world.events.data[1] = world.tick;
        world.events.count = 1;
        trackHerd(scene, world);
        world.tick = checkpoint + 1000;
        world.herdX[0] = 700;
        world.x[0] = 700;
        world.events.count = 0;
        trackHerd(scene, world);
        const metrics = emptyMetrics(scene);
        expect(metrics['eval.herd_stampede_rate'].value).toBeGreaterThan(0);
        expect(metrics['eval.herd_animals'].value).toBe(1);
        expect(metrics['eval.herd_gap_crossings'].value).toBeGreaterThan(0);
        expect(metrics['eval.herd_recolonisations'].value).toBe(1);
    });

    it("separates herd carcass energy from each specialisation's total food intake", () => {
        const scene = createHerdScene(sceneWorld().config);
        const world = sceneWorld();
        world.herdTotals[1] = 20;
        world.foodEatenBySpec[1] = 80;
        world.herdCarcassEatenBySpec[1] = 20;
        trackHerd(scene, world);
        const metrics = emptyMetrics(scene);
        expect(metrics['eval.herd_carcass_share.predator'].value).toBeCloseTo(0.25);
        expect(metrics['eval.herd_carcass_meal_share'].value).toBe(1);
    });
});
