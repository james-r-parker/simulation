// Collects, once per casting agent, every circle one of its rays could hit, into `world.rayLocal` rows.

import { cellOf } from './spatial-hash.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spatial-hash.js').SpatialHash} SpatialHash */

/** Hit kinds, ranked in this order when two hits are equally near. */
export const FOOD = 0;
export const AGENT = 1;
export const OBSTACLE = 2;
export const WALL = 3;
export const SMOKE = 4;

// Indices into `world.rayScratch`, set by `castRays` before it gathers.
export const OX = 0;
export const OY = 1;
export const RANGE = 2;
export const SLOT = 3;
const FIRST_COL = 4;
const FIRST_ROW = 5;
/** Elements `gatherNear` needs in `world.rayScratch`. */
export const GATHER_SCRATCH = 6;

/** Multiplier that packs a hit kind and an index into one number: `kind * KIND_STRIDE + index` sorts as (kind, index). */
export const KIND_STRIDE = 4294967296;

/** Doubles per `rayLocal` row: origin-relative x, origin-relative y, `c` of the ray-circle quadratic, packed key. */
export const LOCAL_STRIDE = 4;

/** Squared-reach slack, far above rounding error: keeps a circle rather than dropping one at the edge of the range. */
const REACH_SLACK = 1.000001;

/** Extra world units around the vision box, so a circle touching its edge is still gathered. */
const BOX_MARGIN = 1;

/**
 * @param {World} world the world
 * @param {number} kind FOOD, AGENT, OBSTACLE or SMOKE
 * @param {number} index the circle's index within its kind
 * @returns {number} the circle's radius
 */
function radiusOf(world, kind, index) {
    if (kind === AGENT) {
        return world.size[index];
    }
    if (kind === FOOD) {
        return world.foodRadius[index];
    }
    return kind === OBSTACLE ? world.obsRadius[index] : world.config.smokeRadius;
}

/**
 * @param {World} world the world
 * @param {number} kind FOOD, AGENT, OBSTACLE or SMOKE
 * @param {number} index the circle's index within its kind
 * @returns {number} the circle's centre x
 */
function centreX(world, kind, index) {
    if (kind === AGENT) {
        return world.x[index];
    }
    if (kind === FOOD) {
        return world.foodX[index];
    }
    return kind === OBSTACLE ? world.obsX[index] : world.cloudX[index];
}

/**
 * @param {World} world the world
 * @param {number} kind FOOD, AGENT, OBSTACLE or SMOKE
 * @param {number} index the circle's index within its kind
 * @returns {number} the circle's centre y
 */
function centreY(world, kind, index) {
    if (kind === AGENT) {
        return world.y[index];
    }
    if (kind === FOOD) {
        return world.foodY[index];
    }
    return kind === OBSTACLE ? world.obsY[index] : world.cloudY[index];
}

/**
 * Appends one circle to the rows when its surface lies within `range` of the origin.
 * @param {World} world the world
 * @param {number} count rows used so far
 * @param {number} kind FOOD, AGENT, OBSTACLE or SMOKE
 * @param {number} index the circle's index within its kind
 * @returns {number} the new row count
 */
function append(world, count, kind, index) {
    const s = world.rayScratch;
    const r = radiusOf(world, kind, index);
    const ox = s[OX] - centreX(world, kind, index);
    const oy = s[OY] - centreY(world, kind, index);
    const reach = s[RANGE] + r;
    const d2 = ox * ox + oy * oy;
    if (d2 > reach * reach * REACH_SLACK) {
        return count;
    }
    const at = count * LOCAL_STRIDE;
    const local = world.rayLocal;
    local[at] = ox;
    local[at + 1] = oy;
    local[at + 2] = d2 - r * r;
    local[at + 3] = kind * KIND_STRIDE + index;
    return count + 1;
}

/**
 * Appends the obstacles and smoke clouds near the origin.
 * @param {World} world the world
 * @returns {number} the row count
 */
function appendFixtures(world) {
    let count = 0;
    for (let i = 0; i < world.obsX.length; i++) {
        count = append(world, count, OBSTACLE, i);
    }
    for (let i = 0; i < world.cloudCount; i++) {
        count = append(world, count, SMOKE, i);
    }
    return count;
}

/**
 * @param {World} world the world
 * @param {SpatialHash} hash the hash
 * @param {number} count rows used so far
 * @param {number} e the entry index
 * @returns {number} the new row count
 */
function appendEntry(world, hash, count, e) {
    const id = hash.entries[e];
    if (id === world.rayScratch[SLOT]) {
        return count;
    }
    return id < hash.maxAgents ? append(world, count, AGENT, id) : append(world, count, FOOD, id - hash.maxAgents);
}

/**
 * Appends the entries of one hash cell that this cell is the first of the query box to hold, so a circle spanning
 * several cells is listed once.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash
 * @param {number} count rows used so far
 * @param {number} cell the cell index
 * @returns {number} the new row count
 */
function appendCell(world, hash, count, cell) {
    const { cellSize, cols, rows, boxX, boxY } = hash;
    const col = cell % cols;
    const row = (cell - col) / cols;
    const c0 = world.rayScratch[FIRST_COL];
    const r0 = world.rayScratch[FIRST_ROW];
    let n = count;
    const end = hash.cellStart[cell + 1];
    for (let e = hash.cellStart[cell]; e < end; e++) {
        if (
            col === Math.max(cellOf(boxX[e], cellSize, cols - 1), c0) &&
            row === Math.max(cellOf(boxY[e], cellSize, rows - 1), r0)
        ) {
            n = appendEntry(world, hash, n, e);
        }
    }
    return n;
}

/**
 * Gathers into `world.rayLocal` the agents, food, obstacles and smoke clouds whose surface lies within `range` of the
 * origin, from the hash cells under the vision box. A circle further out is rejected for every ray anyway, so the
 * rays test only the gathered ones and get the same hits.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built for this tick
 * @param {number} slot the casting agent (never listed); its origin and range are in `world.rayScratch`
 * @returns {number} the number of rows gathered
 */
export function gatherNear(world, hash, slot) {
    const s = world.rayScratch;
    s[SLOT] = slot;
    const { cellSize, cols, rows } = hash;
    const reach = s[RANGE] + BOX_MARGIN;
    const c1 = cellOf(s[OX] + reach, cellSize, cols - 1);
    const r1 = cellOf(s[OY] + reach, cellSize, rows - 1);
    s[FIRST_COL] = cellOf(s[OX] - reach, cellSize, cols - 1);
    s[FIRST_ROW] = cellOf(s[OY] - reach, cellSize, rows - 1);
    let count = appendFixtures(world);
    for (let row = s[FIRST_ROW]; row <= r1; row++) {
        for (let col = s[FIRST_COL]; col <= c1; col++) {
            count = appendCell(world, hash, count, row * cols + col);
        }
    }
    return count;
}
