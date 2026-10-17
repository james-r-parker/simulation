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
const STAMP = 3;

/** Largest stamp before `gatherNear` clears the stamps and starts again. */
const MAX_STAMP = 2147483000;

/** Multiplier that packs a hit kind and an index into one number: `kind * KIND_STRIDE + index` sorts as (kind, index). */
export const KIND_STRIDE = 4294967296;

/** Doubles per `rayLocal` row: origin-relative x, origin-relative y, `c` of the ray-circle quadratic, packed key. */
export const LOCAL_STRIDE = 4;

/** Squared-reach slack, far above rounding error: keeps a circle rather than dropping one at the edge of the range. */
const REACH_SLACK = 1.000001;

/** Extra world units around the vision box, so a circle touching its edge is still gathered. */
const BOX_MARGIN = 1;

/**
 * Keeps the circle staged in the row at `count` when its surface lies within `range` of the origin. The caller has
 * stored the origin-relative x and y, the radius and the key in the row; a kept row has its radius replaced by `c`.
 * @param {World} world the world
 * @param {number} count rows used so far
 * @returns {number} the new row count
 */
function commit(world, count) {
    const local = world.rayLocal;
    const at = count * LOCAL_STRIDE;
    const ox = local[at];
    const oy = local[at + 1];
    const r = local[at + 2];
    const reach = world.rayScratch[RANGE] + r;
    const d2 = ox * ox + oy * oy;
    if (d2 > reach * reach * REACH_SLACK) {
        return count;
    }
    local[at + 2] = d2 - r * r;
    return count + 1;
}

/**
 * Appends the obstacles and smoke clouds near the origin.
 * @param {World} world the world
 * @returns {number} the row count
 */
function appendFixtures(world) {
    const { rayLocal: local, rayScratch: s, obsX, obsY, obsRadius, cloudX, cloudY } = world;
    let count = 0;
    for (let i = 0; i < obsX.length; i++) {
        const at = count * LOCAL_STRIDE;
        local[at] = s[OX] - obsX[i];
        local[at + 1] = s[OY] - obsY[i];
        local[at + 2] = obsRadius[i];
        local[at + 3] = OBSTACLE * KIND_STRIDE + i;
        count = commit(world, count);
    }
    const radius = world.config.smokeRadius;
    for (let i = 0; i < world.cloudCount; i++) {
        const at = count * LOCAL_STRIDE;
        local[at] = s[OX] - cloudX[i];
        local[at + 1] = s[OY] - cloudY[i];
        local[at + 2] = radius;
        local[at + 3] = SMOKE * KIND_STRIDE + i;
        count = commit(world, count);
    }
    return count;
}

/**
 * @param {World} world the world
 * @param {number} count rows used so far
 * @param {number} id the hash entry's circle id: an agent slot, or `maxAgents` plus a food slot
 * @returns {number} the new row count
 */
function appendCircle(world, count, id) {
    const { rayLocal: local, rayScratch: s } = world;
    const at = count * LOCAL_STRIDE;
    const maxAgents = world.config.maxAgents;
    if (id < maxAgents) {
        local[at] = s[OX] - world.x[id];
        local[at + 1] = s[OY] - world.y[id];
        local[at + 2] = world.size[id];
        local[at + 3] = AGENT * KIND_STRIDE + id;
    } else {
        const f = id - maxAgents;
        local[at] = s[OX] - world.foodX[f];
        local[at + 1] = s[OY] - world.foodY[f];
        local[at + 2] = world.foodRadius[f];
        local[at + 3] = FOOD * KIND_STRIDE + f;
    }
    return commit(world, count);
}

/**
 * Appends the circles of one hash cell that no earlier cell of this gather already listed.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash
 * @param {number} count rows used so far
 * @param {number} cell the cell index
 * @returns {number} the new row count
 */
function appendCell(world, hash, count, cell) {
    const { rayStamp, rayScratch: s } = world;
    const stamp = s[STAMP];
    let n = count;
    const end = hash.cellStart[cell + 1];
    for (let e = hash.cellStart[cell]; e < end; e++) {
        const id = hash.entries[e];
        if (rayStamp[id] !== stamp) {
            rayStamp[id] = stamp;
            n = appendCircle(world, n, id);
        }
    }
    return n;
}

/**
 * Starts a gather: a new stamp, with the casting agent stamped so it is never listed. The stamps are cleared when the
 * counter would pass the Int32 range.
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @returns {void}
 */
function startStamp(world, slot) {
    const s = world.rayScratch;
    s[STAMP] += 1;
    if (s[STAMP] >= MAX_STAMP) {
        world.rayStamp.fill(0);
        s[STAMP] = 1;
    }
    world.rayStamp[slot] = s[STAMP];
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
    startStamp(world, slot);
    const { cellSize, cols, rows } = hash;
    const reach = s[RANGE] + BOX_MARGIN;
    const c0 = cellOf(s[OX] - reach, cellSize, cols - 1);
    const c1 = cellOf(s[OX] + reach, cellSize, cols - 1);
    const r0 = cellOf(s[OY] - reach, cellSize, rows - 1);
    const r1 = cellOf(s[OY] + reach, cellSize, rows - 1);
    let count = appendFixtures(world);
    for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
            count = appendCell(world, hash, count, row * cols + col);
        }
    }
    return count;
}
