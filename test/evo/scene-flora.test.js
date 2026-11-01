import { describe, expect, it } from 'vitest';
import { createFloraScene, floraMetrics, trackFlora } from '../../js/evo/scene-flora.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { smallWorld } from '../sim/helpers/small-world.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { allocBody } from '../sim/helpers/body.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { DEATH_CAUSE, EVENT_TYPE, clearEvents, pushEvent } from '../../js/sim/events.js';
import { createScenes, observeScenes } from '../../js/evo/observer-scenes.js';

describe('flora diet detectors', () => {
    it('returns reasons when no plant energy or only one season was observed', () => {
        const scene = createFloraScene();
        expect(floraMetrics(scene)['eval.food_species_share.grass'].value).toBeNull();
        expect(floraMetrics(scene)['eval.seasonal_diet_shift'].reason).toContain('two seasons');
        scene.energy[0] = 100;
        expect(floraMetrics(scene)['eval.food_species_share.grass'].value).toBe(1);
        expect(floraMetrics(scene)['eval.seasonal_diet_shift'].value).toBeNull();
    });

    it('reports species shares and maximal shift for disjoint seasonal diets', () => {
        const scene = createFloraScene();
        scene.energy[0] = 100;
        scene.energy[7] = 300;
        const metrics = floraMetrics(scene);
        expect(metrics['eval.food_species_share.grass'].value).toBe(0.25);
        expect(metrics['eval.food_species_share.berry'].value).toBe(0.75);
        expect(metrics['eval.food_species_share.nut'].value).toBe(0);
        expect(metrics['eval.seasonal_diet_shift'].value).toBe(1);
    });

    it('reports zero shift for an identical diet in every season', () => {
        const scene = createFloraScene();
        for (let season = 0; season < 4; season++) {
            scene.energy[season * 6] = 10 * (season + 1);
            scene.energy[season * 6 + 1] = 30 * (season + 1);
        }
        expect(floraMetrics(scene)['eval.seasonal_diet_shift'].value).toBe(0);
    });

    it('excludes burn-in and counts each observed intake only once', () => {
        const scene = createFloraScene();
        const w = smallWorld();
        w.tick = BURN_IN_TICKS;
        w.floraIntake[0] = 100;
        trackFlora(scene, w);
        w.tick++;
        w.floraIntake[0] = 120;
        trackFlora(scene, w);
        trackFlora(scene, w);
        expect(scene.energy[0]).toBe(20);
    });

    it('records exact energy of a meal before the food slot is cleared', () => {
        const w = smallWorld();
        const scene = createFloraScene();
        const slot = allocBody(w);
        w.x[slot] = w.y[slot] = 500;
        w.energy[slot] = 100;
        w.foodAlive[0] = 1;
        w.foodX[0] = w.foodY[0] = 500;
        w.foodValue[0] = 50;
        w.foodRadius[0] = 10;
        w.foodSpecies[0] = 2;
        w.foodCount = 1;
        w.tick = BURN_IN_TICKS + 1;
        buildHash(w.hash, w);
        feed(w, w.hash);
        expect(w.foodAlive[0]).toBe(0);
        trackFlora(scene, w);
        expect(scene.energy[2]).toBe(50);
    });

    it('registers the scene in the observer', () => {
        const w = smallWorld();
        const scenes = createScenes(w.config);
        w.floraIntake[0] = 100;
        observeScenes({ scenes }, w);
        expect(scenes.flora.mark[0]).toBe(100);
    });
    it('reports exact poison death and sick agent-tick shares once per observed tick', () => {
        const scene = createFloraScene();
        const w = smallWorld();
        w.alive[0] = w.alive[1] = 1;
        w.dose[0] = 0.36;
        w.tick = BURN_IN_TICKS + 1;
        const at = pushEvent(w.events, EVENT_TYPE.AGENT_DIED, BURN_IN_TICKS);
        w.events.data[at + 4] = DEATH_CAUSE.POISONED;
        pushEvent(w.events, EVENT_TYPE.AGENT_DIED, BURN_IN_TICKS);
        // A stale pre-burn-in event and an unrelated event do not enter the denominator.
        pushEvent(w.events, EVENT_TYPE.AGENT_DIED, BURN_IN_TICKS - 1);
        pushEvent(w.events, EVENT_TYPE.AGENT_SICKENED, BURN_IN_TICKS);
        trackFlora(scene, w);
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.toxic_death_share'].value).toBe(0.5);
        expect(floraMetrics(scene)['eval.sick_share'].value).toBe(0.5);
        clearEvents(w.events);
        w.tick++;
        w.dose[0] = 0;
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.sick_share'].value).toBe(0.25);
        expect(scene.deaths).toBe(2);
    });

    it('measures minus electivity from plant item counts and checkpoint availability', () => {
        const scene = createFloraScene();
        const w = smallWorld();
        w.tick = BURN_IN_TICKS;
        w.floraMeals.set([100, 50]);
        trackFlora(scene, w);
        w.tick = BURN_IN_TICKS + 1000;
        w.floraMeals.set([110, 52]);
        w.foodAlive.fill(1);
        w.foodKind.fill(FOOD_KIND.MEAT);
        w.foodKind[0] = w.foodKind[1] = FOOD_KIND.PLANT;
        w.foodTox[1] = 0.8;
        // Dead plants and meat are excluded from the availability denominator.
        w.foodKind[2] = FOOD_KIND.PLANT;
        w.foodAlive[2] = 0;
        w.foodTox[2] = 0.8;
        const before = hashWorld(w);
        trackFlora(scene, w);
        expect(hashWorld(w)).toBe(before);
        expect(scene.available[0]).toBe(2);
        expect(floraMetrics(scene)['eval.toxic_avoidance'].value).toBeCloseTo(3 / 7);
        w.tick++;
        trackFlora(scene, w);
        expect(scene.available[0]).toBe(2);
        scene.meals[1] = 0;
        expect(floraMetrics(scene)['eval.toxic_avoidance'].value).toBe(1);
        scene.meals[1] = 5;
        expect(floraMetrics(scene)['eval.toxic_avoidance'].value).toBe(0);
        scene.available[1] = 0;
        expect(floraMetrics(scene)['eval.toxic_avoidance'].value).toBe(-1);
        scene.meals[1] = 0;
        expect(floraMetrics(scene)['eval.toxic_avoidance'].reason).toContain('no toxic');
    });

    it('has null toxin metrics without their denominators', () => {
        const scene = createFloraScene();
        const metrics = floraMetrics(scene);
        for (const name of ['toxic_death_share', 'sick_share', 'toxic_avoidance']) {
            expect(metrics[`eval.${name}`].value).toBeNull();
            expect(metrics[`eval.${name}`].reason).toBeTypeOf('string');
        }
        scene.meals[0] = 10;
        expect(floraMetrics(scene)['eval.toxic_avoidance'].value).toBeNull();
    });

    it('counts a zero-net toxic plant meal before clearing it and excludes meat', () => {
        const w = smallWorld({ toxinCost: 2 });
        const slot = allocBody(w);
        w.x[slot] = w.y[slot] = 500;
        w.energy[slot] = 100;
        w.foodAlive[0] = 1;
        w.foodX[0] = w.foodY[0] = 500;
        w.foodValue[0] = 50;
        w.foodRadius[0] = 10;
        w.foodTox[0] = 0.8;
        w.foodCount = 1;
        buildHash(w.hash, w);
        feed(w, w.hash);
        expect(Array.from(w.floraMeals)).toEqual([1, 1]);
        expect(w.floraIntake[0]).toBe(0);
        expect(w.foodAlive[0]).toBe(0);
        w.dose[slot] = 0;
        w.foodAlive[0] = 1;
        w.foodKind[0] = FOOD_KIND.MEAT;
        w.foodCount = 1;
        w.foodValue[0] = 50;
        buildHash(w.hash, w);
        feed(w, w.hash);
        expect(Array.from(w.floraMeals)).toEqual([1, 1]);
    });
    it('reports seeded patches per1000 observed ticks after burn-in without counting duplicate observations', () => {
        const w = smallWorld();
        const scene = createFloraScene();
        w.tick = BURN_IN_TICKS;
        pushEvent(w.events, EVENT_TYPE.PATCH_SEEDED, BURN_IN_TICKS - 1);
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.pollination_rate'].value).toBeNull();
        for (let tick = 1; tick <= 1000; tick++) {
            clearEvents(w.events);
            w.tick = BURN_IN_TICKS + tick;
            if (tick === 1 || tick === 500) {
                pushEvent(w.events, EVENT_TYPE.PATCH_SEEDED, w.tick - 1);
            }
            trackFlora(scene, w);
            trackFlora(scene, w);
        }
        expect(scene.pollinations).toBe(2);
        expect(scene.ticks).toBe(1000);
        expect(floraMetrics(scene)['eval.pollination_rate'].value).toBe(2);
    });

    it('averages population hue deviations across live pollinated species and checkpoints', () => {
        const w = smallWorld({ floraPatchMax: 8 });
        const scene = createFloraScene();
        w.patchAlive.set([1, 1, 1, 1, 1, 1, 0, 0]);
        w.patchSpecies.set([1, 1, 3, 3, 0, 5, 1, 4]);
        w.patchHue.set([-0.5, 0.5, 0, 1, -1, 1, -1, 0]);
        w.tick = BURN_IN_TICKS + 999;
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.flora_hue_spread'].value).toBeNull();
        w.tick++;
        trackFlora(scene, w);
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.flora_hue_spread'].value).toBe(0.5);
        w.tick += 1000;
        w.patchHue.fill(0);
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.flora_hue_spread'].value).toBe(0.25);
        w.patchAlive.fill(0);
        w.tick += 1000;
        trackFlora(scene, w);
        expect(scene.hueCheckpoints).toBe(2);
        expect(floraMetrics(scene)['eval.flora_hue_spread'].value).toBe(0.25);
    });

    it('measures the patch pool full share at post-burn-in checkpoints', () => {
        const w = smallWorld({ floraPatchMax: 4 });
        const scene = createFloraScene();
        const firstCheckpoint = Math.ceil((BURN_IN_TICKS + 1) / 1000) * 1000;
        for (let checkpoint = 0; checkpoint < 4; checkpoint++) {
            w.tick = firstCheckpoint + checkpoint * 1000;
            w.patchAlive.fill(checkpoint < 2 ? 1 : 0);
            trackFlora(scene, w);
        }
        expect(scene.patchPoolCheckpoints).toBe(4);
        expect(floraMetrics(scene)['eval.flora_patch_pool_full_share'].value).toBe(0.5);
    });

    it('reports zero when the patch pool never fills and null before the first checkpoint', () => {
        const w = smallWorld({ floraPatchMax: 4 });
        const scene = createFloraScene();
        const metric = () => floraMetrics(scene)['eval.flora_patch_pool_full_share'];
        expect(metric().value).toBeNull();
        expect(metric().reason).toContain('no patch-pool checkpoints');
        const firstCheckpoint = Math.ceil((BURN_IN_TICKS + 1) / 1000) * 1000;
        w.patchAlive.fill(0);
        w.tick = firstCheckpoint;
        trackFlora(scene, w);
        expect(metric().value).toBe(0);
    });

    it('measures patch deaths per 1000 post-burn-in ticks without double counting', () => {
        const emptyWorld = smallWorld();
        const emptyScene = createFloraScene();
        emptyWorld.tick = BURN_IN_TICKS + 1;
        trackFlora(emptyScene, emptyWorld);
        expect(floraMetrics(emptyScene)['eval.flora_patch_death_rate'].value).toBe(0);

        const w = smallWorld();
        const scene = createFloraScene();
        const metric = () => floraMetrics(scene)['eval.flora_patch_death_rate'];
        expect(metric().value).toBeNull();
        expect(metric().reason).toContain('no observed ticks');
        w.tick = BURN_IN_TICKS + 1;
        pushEvent(w.events, EVENT_TYPE.PATCH_DIED, BURN_IN_TICKS);
        pushEvent(w.events, EVENT_TYPE.PATCH_DIED, BURN_IN_TICKS + 1);
        trackFlora(scene, w);
        trackFlora(scene, w);
        expect(metric().value).toBe(1000);
        clearEvents(w.events);
        w.tick++;
        trackFlora(scene, w);
        expect(metric().value).toBe(500);
    });

    it('measures mean seed-bank slot occupancy at 1000-tick checkpoints', () => {
        const w = smallWorld({ floraPatchMax: 4 });
        const scene = createFloraScene();
        const metric = () => floraMetrics(scene)['eval.flora_seed_bank_occupancy_share'];
        expect(metric().value).toBeNull();
        expect(metric().reason).toContain('no seed-bank checkpoints');
        const firstCheckpoint = Math.ceil((BURN_IN_TICKS + 1) / 1000) * 1000;
        w.patchBank.fill(0);
        w.tick = firstCheckpoint;
        trackFlora(scene, w);
        expect(metric().value).toBe(0);
        w.patchBank.fill(0);
        w.patchBank[0] = w.patchBank[1] = 1;
        w.tick = firstCheckpoint + 1000;
        trackFlora(scene, w);
        w.patchBank.fill(1);
        w.tick = firstCheckpoint + 2000;
        trackFlora(scene, w);
        expect(scene.seedBankCheckpoints).toBe(3);
        expect(metric().value).toBe(0.5);
    });

    it('reports zero deviation for a single live pollinated patch and null with none', () => {
        const w = smallWorld();
        const scene = createFloraScene();
        w.tick = BURN_IN_TICKS + 1000;
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.flora_hue_spread'].reason).toContain('no live pollinated');
        expect(floraMetrics(scene)['eval.pollination_rate'].value).toBe(0);
        w.patchAlive[0] = 1;
        w.patchSpecies[0] = 3;
        w.patchHue[0] = 0.9;
        w.tick += 1000;
        trackFlora(scene, w);
        expect(floraMetrics(scene)['eval.flora_hue_spread'].value).toBe(0);
    });
});
