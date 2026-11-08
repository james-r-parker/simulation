// Winter band shift and winter patch proximity (seasonal-movement.md, Detectors): shares at one winter and one other
// checkpoint on hand-built positions, beside `scene-season.test.js`.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { sampleSeason } from '../../js/evo/scene-season.js';
import { WINTER } from '../../js/sim/eras.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';
import { loose } from './helpers/metric-registry.js';

const WORLD = { worldWidth: 4000, worldHeight: 2000, coldMarginWidth: 600, refugeCount: 2, wallGaps: 1, maxAgents: 64 };

const read = (/** @type {any} */ r, /** @type {string} */ name) =>
    loose(computeMetrics(r.observer, r.world))[`eval.${name}`];

/** Kills every agent, then adds one at each `[x, y]`. */
function place(/** @type {any} */ world, /** @type {number[][]} */ points) {
    world.alive.fill(0);
    for (const [x, y] of points) {
        addBlob(world, { x, y });
    }
}

function checkpoint(/** @type {any} */ r, /** @type {number} */ tick, /** @type {number} */ season) {
    r.world.tick = tick;
    r.world.season[0] = season;
    sampleSeason(r.observer.scenes.season, r.observer.scenes.terrain, r.world);
}

describe('eval.winter_band_shift', () => {
    it('is the share inside the cold margin in winter minus the share at the other checkpoints', () => {
        const r = observed(WORLD);
        const { coldMarginWidth: width, worldHeight } = r.world.config;
        // Other: 3 of 4 in a margin (north and south). Winter: 1 of 4.
        place(r.world, [
            [500, width - 10],
            [600, worldHeight - width + 10],
            [700, 5],
            [800, 1000],
        ]);
        checkpoint(r, 11000, 0);
        place(r.world, [
            [500, width - 10],
            [600, 1000],
            [700, 1000],
            [800, 1000],
        ]);
        checkpoint(r, 12000, WINTER);
        expect(read(r, 'winter_band_shift').value).toBeCloseTo(0.25 - 0.75, 12);
    });

    it('reads snowMarginWidth when the config has it, and coldMarginWidth otherwise', () => {
        const r = observed(WORLD);
        const width = r.world.config.coldMarginWidth;
        place(r.world, [[500, width + 100]]);
        checkpoint(r, 11000, 0);
        checkpoint(r, 12000, WINTER);
        expect(r.observer.scenes.season.inMargin[0]).toBe(0);
        const wide = observed(WORLD);
        place(wide.world, [[500, width + 100]]);
        const world = { ...wide.world, config: { ...wide.world.config, snowMarginWidth: width + 200 } };
        world.tick = 12000;
        world.season[0] = WINTER;
        sampleSeason(wide.observer.scenes.season, wide.observer.scenes.terrain, world);
        expect(wide.observer.scenes.season.inMargin[0]).toBe(1);
    });

    it('is null without a winter and an other checkpoint', () => {
        const r = observed(WORLD);
        place(r.world, [[500, 1000]]);
        checkpoint(r, 12000, WINTER);
        expect(read(r, 'winter_band_shift').value).toBeNull();
        expect(read(r, 'winter_patch_proximity').value).toBeNull();
    });
});

describe('eval.winter_patch_proximity', () => {
    /** Makes patch `p` alive at (x, y) with `weight`. */
    function patch(/** @type {any} */ world, /** @type {number} */ p, /** @type {number[]} */ at) {
        world.patchAlive[p] = 1;
        [world.patchX[p], world.patchY[p], world.patchWeight[p]] = at;
    }

    it('is the share within foodPatchRadius of a fruiting patch in winter minus the others, ignoring weightless and dead patches', () => {
        const r = observed(WORLD);
        const radius = r.world.config.foodPatchRadius;
        patch(r.world, 0, [1000, 1000, 1]);
        patch(r.world, 1, [3000, 1000, 0]);
        patch(r.world, 2, [3000, 500, 1]);
        r.world.patchAlive[2] = 0;
        // Other: 1 of 4 near the fruiting patch. Winter: 3 of 4.
        place(r.world, [
            [1000 + radius - 1, 1000],
            [3000, 1000],
            [3000, 500],
            [100, 100],
        ]);
        checkpoint(r, 11000, 0);
        place(r.world, [
            [1000, 1000],
            [1000, 1000 + radius - 1],
            [1000 - radius + 1, 1000],
            [3000, 1000],
        ]);
        checkpoint(r, 12000, WINTER);
        expect(read(r, 'winter_patch_proximity').value).toBeCloseTo(0.75 - 0.25, 12);
    });
});
