// Boom and bust per basin on a hand-built `basins` world: agents placed west or east of the wall line, populations
// emptied and refilled with or without an entrant.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { RECOLONISED_MIN, noteBasinBirth, sampleBasins } from '../../js/evo/scene-basin.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const WEST = 500;
const EAST = 3000;
const BASINS = {
    terrainLayout: 'basins',
    obstacleCount: 0,
    worldWidth: 4000,
    worldHeight: 2000,
    refugeCount: 2,
    wallGaps: 1,
    maxAgents: 64,
};

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** @returns {number[]} the slots of `n` new agents at x */
function fill(/** @type {any} */ world, /** @type {number} */ n, /** @type {number} */ x) {
    return Array.from({ length: n }, () => addBlob(world, { x }));
}

describe('eval.basin_recolonisations and eval.basin_pop_cv', () => {
    it('count a refilled basin, and take the coefficient of variation of each basin at the 1000-tick checkpoints', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.basin;
        fill(r.world, 6, EAST);
        r.world.tick = T0;
        sampleBasins(scene, r.world);
        expect(scene.extinct[0]).toBe(1);
        fill(r.world, RECOLONISED_MIN, WEST);
        r.world.tick = T0 + 10;
        sampleBasins(scene, r.world);
        r.world.tick = T0 + 1000;
        sampleBasins(scene, r.world);
        expect(read(r, 'basin_recolonisations').value).toBe(1);
        // West held 0 then 5 (mean 2.5, deviation 2.5, CV 1); east held 6 both times (CV 0).
        expect(read(r, 'basin_pop_cv').value).toBeCloseTo(0.5, 12);
    });

    it('do not count a basin an entrant refilled, nor one that has not reached five yet', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.basin;
        fill(r.world, 6, WEST);
        r.world.tick = T0 + 10;
        sampleBasins(scene, r.world);
        expect(scene.extinct[1]).toBe(1);
        const [arrival] = fill(r.world, 1, EAST);
        noteBasinBirth(scene, r.world, { slot: arrival, cause: BORN_CAUSE.FLOOR });
        fill(r.world, RECOLONISED_MIN, EAST);
        r.world.tick = T0 + 20;
        sampleBasins(scene, r.world);
        expect(scene.recolonised).toBe(0);
        expect(scene.extinct[1]).toBe(0);
    });

    it('wait for five when no entrant came, and let a mating birth leave the basin untainted', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.basin;
        fill(r.world, 6, WEST);
        r.world.tick = T0 + 10;
        sampleBasins(scene, r.world);
        const [first] = fill(r.world, RECOLONISED_MIN - 1, EAST);
        noteBasinBirth(scene, r.world, { slot: first, cause: BORN_CAUSE.MATE });
        r.world.tick = T0 + 20;
        sampleBasins(scene, r.world);
        expect(scene.recolonised).toBe(0);
        expect(scene.extinct[1]).toBe(1);
        fill(r.world, 1, EAST);
        r.world.tick = T0 + 30;
        sampleBasins(scene, r.world);
        expect(scene.recolonised).toBe(1);
    });

    it('count an entrant only for a basin that is extinct, and an immigrant counts as one', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.basin;
        const [west] = fill(r.world, 1, WEST);
        noteBasinBirth(scene, r.world, { slot: west, cause: BORN_CAUSE.IMMIGRANT });
        expect(Array.from(scene.entrant)).toEqual([0, 0]);
        scene.extinct[0] = 1;
        noteBasinBirth(scene, r.world, { slot: west, cause: BORN_CAUSE.IMMIGRANT });
        expect(Array.from(scene.entrant)).toEqual([1, 0]);
    });

    it('count nothing before burn-in, and read null on an open world or before a checkpoint', () => {
        const r = observed(BASINS);
        const scene = r.observer.scenes.basin;
        fill(r.world, 6, EAST);
        r.world.tick = T0 - 1000;
        sampleBasins(scene, r.world);
        fill(r.world, RECOLONISED_MIN, WEST);
        r.world.tick = T0 - 990;
        sampleBasins(scene, r.world);
        expect(scene.recolonised).toBe(0);
        expect(read(r, 'basin_pop_cv').value).toBeNull();
        const open = observed();
        expect(read(open, 'basin_recolonisations').reason).toContain('not basins');
        expect(read(open, 'basin_pop_cv').value).toBeNull();
    });
});
