// Season-map instruments on hand-built grids (seasonal-movement.md, Detectors): the winter-against-summer total
// variation distance of agents and of herd centroids, minus the summer half-against-half floor.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { GRID_COLS, GRID_ROWS, createSeasonMapScene, sampleSeasonMap } from '../../js/evo/scene-season-map.js';
import { WINTER } from '../../js/sim/eras.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';
import { loose } from './helpers/metric-registry.js';

const SUMMER = 1;
const SPRING = 0;
const T0 = 10000;
const WORLD = { worldWidth: 3200, worldHeight: 1800, maxAgents: 64 };

/** The centre of grid cell (col, row) in world px. */
const centre = (/** @type {any} */ w, /** @type {number} */ col, /** @type {number} */ row) => [
    ((col + 0.5) / GRID_COLS) * w.config.worldWidth,
    ((row + 0.5) / GRID_ROWS) * w.config.worldHeight,
];

/** Places one agent per `[col, row]` and returns nothing; earlier agents are killed. */
function place(/** @type {any} */ world, /** @type {number[][]} */ cells) {
    world.alive.fill(0);
    world.groupAnimalCount.fill(0);
    for (const [col, row] of cells) {
        const slot = addBlob(world);
        [world.x[slot], world.y[slot]] = centre(world, col, row);
    }
}

/** Takes checkpoints: each entry is `[season, agentCells]`, 1000 ticks apart. */
function run(/** @type {any} */ r, /** @type {Array<[number, number[][]]>} */ checkpoints) {
    checkpoints.forEach(([season, cells], i) => {
        r.world.tick = T0 + 1000 * i;
        r.world.season[0] = season;
        place(r.world, cells);
        sampleSeasonMap(r.observer.scenes.seasonMap, r.world);
    });
}

const read = (/** @type {any} */ r, /** @type {string} */ name) =>
    loose(computeMetrics(r.observer, r.world))[`eval.${name}`];

describe('eval.season_map_distance', () => {
    it('is the winter-to-summer distance minus the summer half-against-half floor', () => {
        const r = observed(WORLD);
        const west = [[1, 1]];
        const east = [[10, 5]];
        run(r, [
            [SUMMER, west],
            [SUMMER, west],
            [WINTER, east],
            [SPRING, east],
        ]);
        // Both summer halves are identical (floor 0); winter shares no cell with summer (distance 1).
        expect(read(r, 'season_map_distance').value).toBe(1);
    });

    it('subtracts the noise floor: summer halves that already differ leave less to the winter move', () => {
        const r = observed(WORLD);
        run(r, [
            [SUMMER, [[1, 1]]],
            [SUMMER, [[10, 5]]],
            [WINTER, [[1, 1]]],
        ]);
        // Floor 1 (disjoint halves); winter [1,1] against summer half and half is 0.5.
        expect(read(r, 'season_map_distance').value).toBe(0.5 - 1);
    });

    it('is 0 when winter looks like summer', () => {
        const r = observed(WORLD);
        const cells = [
            [2, 2],
            [3, 3],
        ];
        run(r, [
            [SUMMER, cells],
            [SUMMER, cells],
            [WINTER, cells],
        ]);
        expect(read(r, 'season_map_distance').value).toBe(0);
    });

    it('is null without a winter checkpoint, or with only one summer half, and before burn-in', () => {
        const r = observed(WORLD);
        run(r, [
            [SUMMER, [[1, 1]]],
            [SUMMER, [[1, 1]]],
        ]);
        expect(read(r, 'season_map_distance').value).toBeNull();
        const s = observed(WORLD);
        run(s, [
            [SUMMER, [[1, 1]]],
            [WINTER, [[1, 1]]],
        ]);
        expect(read(s, 'season_map_distance').value).toBeNull();
        const early = observed(WORLD);
        early.world.tick = 10;
        early.world.season[0] = WINTER;
        sampleSeasonMap(early.observer.scenes.seasonMap, early.world);
        expect(early.observer.scenes.seasonMap.agents.some((/** @type {number} */ v) => v > 0)).toBe(false);
    });
});

describe('eval.herd_season_shift', () => {
    /** Sets the herd group centroids (one per group) and counts them as alive. */
    function herds(/** @type {any} */ world, /** @type {number[][]} */ cells) {
        world.groupAnimalCount.fill(0);
        cells.forEach(([col, row], group) => {
            world.groupAnimalCount[group] = 3;
            [world.groupCentroidX[group], world.groupCentroidY[group]] = centre(world, col, row);
        });
    }

    it('reads the same distance on the herd group centroids, ignoring empty groups', () => {
        const r = observed({ ...WORLD, herdCount: 3 });
        const at = (/** @type {number} */ season, /** @type {number[][]} */ cells) => {
            r.world.tick = T0 + 1000 * r.observer.scenes.seasonMap.calls++;
            r.world.season[0] = season;
            herds(r.world, cells);
            sampleSeasonMap(r.observer.scenes.seasonMap, r.world);
        };
        r.observer.scenes.seasonMap.calls = 0;
        at(SUMMER, [[1, 1]]);
        at(SUMMER, [[1, 1]]);
        at(WINTER, [[12, 7]]);
        expect(read(r, 'herd_season_shift').value).toBe(1);
        expect(createSeasonMapScene().herds).toHaveLength(3 * GRID_COLS * GRID_ROWS);
    });

    it('is null when no herd group is alive', () => {
        const r = observed({ ...WORLD, herdCount: 3 });
        run(r, [
            [SUMMER, [[1, 1]]],
            [SUMMER, [[1, 1]]],
            [WINTER, [[1, 1]]],
        ]);
        expect(read(r, 'herd_season_shift').value).toBeNull();
        expect(read(r, 'season_map_distance').value).toBe(0);
    });
});
