import { describe, expect, it } from 'vitest';
import { createFloraScene, floraMetrics, trackFlora } from '../../js/evo/scene-flora.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { smallWorld } from '../sim/helpers/small-world.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { allocBody } from '../sim/helpers/body.js';
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
});
