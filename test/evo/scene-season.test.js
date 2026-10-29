// Season changes the map: agents placed in known basins and at known distances from the cold-margin edge at one winter
// and one other checkpoint.

import { describe, expect, it } from 'vitest';
import { WINTER } from '../../js/sim/eras.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { sampleSeason } from '../../js/evo/scene-season.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

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

/** Adds `n` agents at x, y. */
function crowd(/** @type {any} */ world, /** @type {Record<string, number>} */ f) {
    return Array.from({ length: f.n }, () => addBlob(world, { x: f.x, y: f.y }));
}

/** Takes a checkpoint at `tick` in `season` over the agents alive then. */
function checkpoint(/** @type {any} */ r, /** @type {number} */ tick, /** @type {number} */ season) {
    r.world.tick = tick;
    r.world.season[0] = season;
    sampleSeason(r.observer.scenes.season, r.observer.scenes.terrain, r.world);
}

describe('eval.winter_basin_density and eval.winter_shelter_distance', () => {
    it('compare winter with the other checkpoints per basin and in distance to shelter', () => {
        const r = observed(BASINS);
        const edge = r.world.config.coldMarginWidth;
        // Other checkpoint: 4 west and 2 east agents, 10 px from the cold-margin edge.
        const other = [
            ...crowd(r.world, { n: 4, x: 1950, y: edge + 10 }),
            ...crowd(r.world, { n: 2, x: 2050, y: edge + 10 }),
        ];
        checkpoint(r, 11000, 0);
        for (const slot of other) {
            r.world.alive[slot] = 0;
        }
        // Winter checkpoint: 2 and 2 agents, 30 px from the edge.
        crowd(r.world, { n: 2, x: 1950, y: edge + 30 });
        crowd(r.world, { n: 2, x: 2050, y: edge + 30 });
        checkpoint(r, 12000, WINTER);
        // West 2 / 4 = 0.5, east 2 / 2 = 1; the mean of the two ratios.
        expect(read(r, 'winter_basin_density').value).toBeCloseTo(0.75, 12);
        expect(read(r, 'winter_shelter_distance').value).toBeCloseTo(20, 12);
    });

    it('measure the distance to the nearer of the two margin edges (the south one here)', () => {
        const r = observed(BASINS);
        const { coldMarginWidth, worldHeight } = r.world.config;
        crowd(r.world, { n: 1, x: 1950, y: worldHeight - coldMarginWidth - 5 });
        checkpoint(r, 11000, 0);
        expect(r.observer.scenes.season.distance[1]).toBeCloseTo(5, 6);
    });

    it('count nothing before burn-in, without eras or off the basins layout, and read null then', () => {
        const early = observed(BASINS);
        crowd(early.world, { n: 2, x: 1950, y: 500 });
        checkpoint(early, 9000, WINTER);
        checkpoint(early, 9500, 0);
        expect(read(early, 'winter_basin_density').value).toBeNull();
        const open = observed();
        crowd(open.world, { n: 1, x: 100, y: 500 });
        checkpoint(open, 11000, WINTER);
        expect(read(open, 'winter_shelter_distance').value).toBeNull();
    });
});
