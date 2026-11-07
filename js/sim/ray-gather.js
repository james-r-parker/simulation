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
export const HERD = 5;

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
 * The distance test for a gathered circle, before anything is written: a fixture row is filled only when it is kept.
 * @param {Float64Array} s the ray scratch (`RANGE`)
 * @param {number} ox the circle's origin-relative x
 * @param {number} oy the circle's origin-relative y
 * @param {number} r the circle's radius
 * @returns {number} the row's `c` (squared distance less squared radius), NaN when the circle is out of reach
 */
function fixtureC(s, ox, oy, r) {
    const reach = s[RANGE] + r;
    const d2 = ox * ox + oy * oy;
    return d2 > reach * reach * REACH_SLACK ? NaN : d2 - r * r;
}

/**
 * Appends the obstacles near the origin. Each is rejected on one axis first (`d2` is at least `ox * ox`, so a gap past
 * the reach on one axis fails the distance test too), so a far one costs a subtraction and a compare, with no store.
 * @param {World} world the world
 * @param {number} count rows used so far
 * @returns {number} the new row count
 */
function appendObstacles(world, count) {
    const { rayLocal: local, rayScratch: s, obsX, obsY, obsRadius } = world;
    const px = s[OX];
    const range = s[RANGE];
    let n = count;
    for (let i = 0; i < obsX.length; i++) {
        const ox = px - obsX[i];
        const reach = range + obsRadius[i];
        if (ox * ox > reach * reach * REACH_SLACK) {
            continue;
        }
        const oy = s[OY] - obsY[i];
        const c = fixtureC(s, ox, oy, obsRadius[i]);
        if (c === c) {
            const at = n++ * LOCAL_STRIDE;
            local[at] = ox;
            local[at + 1] = oy;
            local[at + 2] = c;
            local[at + 3] = OBSTACLE * KIND_STRIDE + i;
        }
    }
    return n;
}

/**
 * Appends the live herd bodies near the origin, with the same one-axis reject.
 * @param {World} world the world
 * @param {number} count rows used so far
 * @returns {number} the new row count
 */
function appendHerds(world, count) {
    const { rayLocal: local, rayScratch: s, herdAlive, herdX, herdY } = world;
    const herdRadius = world.config.herdRadius;
    const herdReach = s[RANGE] + herdRadius;
    const herdReach2 = herdReach * herdReach * REACH_SLACK;
    let n = count;
    for (let i = 0; i < world.herdMax; i++) {
        if (herdAlive[i] !== 1) {
            continue;
        }
        const ox = s[OX] - herdX[i];
        if (ox * ox > herdReach2) {
            continue;
        }
        const oy = s[OY] - herdY[i];
        const c = fixtureC(s, ox, oy, herdRadius);
        if (c === c) {
            const at = n++ * LOCAL_STRIDE;
            local[at] = ox;
            local[at + 1] = oy;
            local[at + 2] = c;
            local[at + 3] = HERD * KIND_STRIDE + i;
        }
    }
    return n;
}

/**
 * Appends obstacles, live herd bodies and smoke clouds near the origin, in the order and with the values the distance test keeps.
 * @param {World} world the world
 * @returns {number} the row count
 */
function appendFixtures(world) {
    const { rayLocal: local, rayScratch: s, cloudX, cloudY } = world;
    let n = appendHerds(world, appendObstacles(world, 0));
    const radius = world.config.smokeRadius;
    for (let i = 0; i < world.cloudCount; i++) {
        const ox = s[OX] - cloudX[i];
        const oy = s[OY] - cloudY[i];
        const c = fixtureC(s, ox, oy, radius);
        if (c === c) {
            const at = n++ * LOCAL_STRIDE;
            local[at] = ox;
            local[at + 1] = oy;
            local[at + 2] = c;
            local[at + 3] = SMOKE * KIND_STRIDE + i;
        }
    }
    return n;
}

/**
 * Appends one hash entry when its surface lies within range, testing before it writes: a far circle costs no stores
 * into `rayLocal`, and a kept row holds the same values as before.
 * @param {World} world the world
 * @param {number} count rows used so far
 * @param {number} id the hash entry's circle id: an agent slot, or `maxAgents` plus a food slot
 * @returns {number} the new row count
 */
function appendCircle(world, count, id) {
    const s = world.rayScratch;
    const maxAgents = world.config.maxAgents;
    const isAgent = id < maxAgents;
    const f = id - maxAgents;
    const ox = s[OX] - (isAgent ? world.x[id] : world.foodX[f]);
    const oy = s[OY] - (isAgent ? world.y[id] : world.foodY[f]);
    const r = isAgent ? world.size[id] : world.foodRadius[f];
    const reach = s[RANGE] + r;
    const d2 = ox * ox + oy * oy;
    if (d2 > reach * reach * REACH_SLACK) {
        return count;
    }
    const local = world.rayLocal;
    const at = count * LOCAL_STRIDE;
    local[at] = ox;
    local[at + 1] = oy;
    local[at + 2] = d2 - r * r;
    local[at + 3] = isAgent ? AGENT * KIND_STRIDE + id : FOOD * KIND_STRIDE + f;
    return count + 1;
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
