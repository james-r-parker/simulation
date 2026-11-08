// eval.prey_summer_min: the lowest prey count at the 1000-tick checkpoints inside a summer (season index 1 of 4), on a
// hand-built series.

import { describe, expect, it } from 'vitest';
import { createGuardScene, sampleGuards, summerMetrics } from '../../js/evo/scene-guards.js';
import { directionOf } from './helpers/metric-registry.js';

const ERA = 36000;
const CONFIG = { eraSeasonTicks: ERA, specialisations: { forager: {}, predator: {} } };

/**
 * @param {number} tick the tick
 * @param {number} prey the number of prey (specialisation 0) alive
 * @returns {Record<string, any>} a hand-built world with those prey and one hunter
 */
function world(tick, prey) {
    const w = { tick, alive: new Uint8Array(400), spec: new Uint8Array(400), huntBySpec: new Float64Array([0, 1]) };
    w.alive.fill(1, 0, prey + 1);
    w.spec[prey] = 1;
    return w;
}

describe('eval.prey_summer_min', () => {
    it('reads the lowest prey count inside the summer and ignores the other seasons', () => {
        const scene = createGuardScene(CONFIG);
        sampleGuards(scene, world(ERA - 1000, 10)); // spring: ignored
        sampleGuards(scene, world(ERA + 1000, 150));
        sampleGuards(scene, world(ERA + 5000, 80));
        sampleGuards(scene, world(ERA + 9000, 120));
        sampleGuards(scene, world(2 * ERA, 5)); // autumn: ignored
        expect(summerMetrics(scene)).toEqual({ 'eval.prey_summer_min': { value: 80 } });
    });

    it('takes the minimum over every summer, in later years too', () => {
        const scene = createGuardScene(CONFIG);
        sampleGuards(scene, world(ERA + 2000, 200));
        sampleGuards(scene, world(5 * ERA + 2000, 60));
        expect(summerMetrics(scene)['eval.prey_summer_min']).toEqual({ value: 60 });
    });

    it('is null with a reason for a seed with no summer yet, and without eraSeasonTicks', () => {
        const scene = createGuardScene(CONFIG);
        sampleGuards(scene, world(ERA - 1000, 90));
        expect(summerMetrics(scene)['eval.prey_summer_min'].value).toBeNull();
        expect(summerMetrics(scene)['eval.prey_summer_min'].reason).toMatch(/no summer/);
        const off = createGuardScene({ specialisations: CONFIG.specialisations });
        sampleGuards(off, world(ERA + 1000, 90));
        expect(summerMetrics(off)['eval.prey_summer_min'].value).toBeNull();
    });

    it('is a higher metric', () => {
        expect(directionOf('eval.prey_summer_min')).toBe('higher');
    });
});
