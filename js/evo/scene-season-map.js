// Does the map move with the season (seasonal-movement.md, Detectors)? At the 1000-tick checkpoints from `BURN_IN_TICKS`,
// the alive agents and the herd group centroids are binned into a `GRID_COLS` by `GRID_ROWS` grid, kept apart for winter
// checkpoints and for summer ones (the era season `WINTER` and `SUMMER`). Summer checkpoints alternate between two halves
// (A, B), so the noise floor is the same distance between two interleaved summer samples of the same seasons and drift.
//
// - `eval.season_map_distance`: total variation distance between the winter and the summer agent grids, minus the
//   distance between the two summer halves (higher: the map moves with the season).
// - `eval.herd_season_shift`: the same on the herd group centroids.
//
// Each is `null` without a winter checkpoint and a checkpoint in each summer half that held something. Both are
// instruments (`watch`); none is a reward. Counts only; nothing is allocated per sample (the metrics allocate once).

import { WINTER } from '../sim/eras.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

/** Grid columns and rows over the world. */
export const GRID_COLS = 16;
export const GRID_ROWS = 9;

/** The era season index of summer (`SUMMER` in `js/sim/eras.js`, not exported there). */
const SUMMER = 1;

const CELLS = GRID_COLS * GRID_ROWS;
const WINTER_GRID = 0;
const SUMMER_A = 1;
const SUMMER_B = 2;

/**
 * @returns {Record<string, any>} an empty season-map scene: three grids each of agents and of herd centroids (winter,
 *   summer half A, summer half B) and the summer checkpoints seen
 */
export function createSeasonMapScene() {
    return {
        agents: new Float64Array(3 * CELLS),
        herds: new Float64Array(3 * CELLS),
        summerCheckpoints: 0,
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} x a position
 * @param {number} y a position
 * @returns {number} the grid cell of the position, clamped to the grid
 */
function cellOf(world, x, y) {
    const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((x / world.config.worldWidth) * GRID_COLS)));
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y / world.config.worldHeight) * GRID_ROWS)));
    return row * GRID_COLS + col;
}

/**
 * Runs one checkpoint (call when the tick divides by 1000); does nothing before burn-in and in spring and autumn.
 * @param {Record<string, any>} scene the season-map scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleSeasonMap(scene, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const season = world.season[0];
    let grid = WINTER_GRID;
    if (season === SUMMER) {
        grid = scene.summerCheckpoints % 2 === 0 ? SUMMER_A : SUMMER_B;
        scene.summerCheckpoints += 1;
    } else if (season !== WINTER) {
        return;
    }
    const base = grid * CELLS;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            scene.agents[base + cellOf(world, world.x[slot], world.y[slot])] += 1;
        }
    }
    for (let group = 0; group < world.groupAnimalCount.length; group++) {
        if (world.groupAnimalCount[group] > 0) {
            scene.herds[base + cellOf(world, world.groupCentroidX[group], world.groupCentroidY[group])] += 1;
        }
    }
}

/**
 * @param {ArrayLike<number>} a a grid of counts
 * @param {ArrayLike<number>} b a grid of counts
 * @returns {number} the total variation distance between the two normalised grids; -1 when either is empty
 */
function variation(a, b) {
    let sumA = 0;
    let sumB = 0;
    for (let c = 0; c < CELLS; c++) {
        sumA += a[c];
        sumB += b[c];
    }
    if (sumA === 0 || sumB === 0) {
        return -1;
    }
    let total = 0;
    for (let c = 0; c < CELLS; c++) {
        total += Math.abs(a[c] / sumA - b[c] / sumB);
    }
    return total / 2;
}

/**
 * @param {Float64Array} counts the winter, summer A and summer B grids of counts
 * @param {string} what what the grids count, for the reason
 * @returns {import('./metrics-stats.js').MetricResult} winter against all summer, minus the summer half-against-half floor
 */
function shift(counts, what) {
    const winter = counts.subarray(0, CELLS);
    const a = counts.subarray(CELLS, 2 * CELLS);
    const b = counts.subarray(2 * CELLS, 3 * CELLS);
    const summer = a.map((v, c) => v + b[c]);
    const floor = variation(a, b);
    const distance = variation(winter, summer);
    if (floor < 0 || distance < 0) {
        return none(`no winter checkpoint and no checkpoint in each summer half with ${what} after burn-in`);
    }
    return ok(distance - floor);
}

/**
 * @param {Record<string, any>} scene the season-map scene
 * @returns {import('./metrics-stats.js').MetricRecord} the two season-map metrics
 */
export function seasonMapMetrics(scene) {
    return {
        'eval.season_map_distance': shift(scene.agents, 'an alive agent'),
        'eval.herd_season_shift': shift(scene.herds, 'a herd group'),
    };
}
