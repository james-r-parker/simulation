// Casts each agent's rays through the spatial hash, writing proximity and class one-hot to its inputs row.

import { RAY_CHANNELS } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { isKin } from './kin.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spatial-hash.js').SpatialHash} SpatialHash */

const FOOD = 0;
const AGENT = 1;
const OBSTACLE = 2;
const WALL = 3;

// Indices into `world.rayScratch`.
const OX = 0;
const OY = 1;
const DX = 2;
const DY = 3;
const RANGE = 4;
const BEST_T = 5;
const BEST_KIND = 6;
const BEST_INDEX = 7;
const CELL_X = 8;
const CELL_Y = 9;
const T_MAX_X = 10;
const T_MAX_Y = 11;
const T_STEP_X = 12;
const T_STEP_Y = 13;
const STEP_X = 14;
const STEP_Y = 15;
const COS_H = 16;
const SIN_H = 17;

// Offsets of each class flag within a ray's channels.
const CH_FOOD = 1;
const CH_BIGGER = 2;
const CH_SMALLER = 3;
const CH_SIMILAR = 4;
const CH_KIN = 5;
const CH_WALL = 6;
const CH_OBSTACLE = 7;

/**
 * Keeps a hit when it is nearer than the best so far, or equal and ranked earlier by kind then index.
 * @param {Float64Array} s the ray scratch
 * @param {number} t distance along the ray, or a negative number for no hit
 * @param {number} kind FOOD, AGENT, OBSTACLE or WALL
 * @param {number} index the circle's index within its kind
 * @returns {void}
 */
function consider(s, t, kind, index) {
    if (t < 0 || t > s[RANGE]) {
        return;
    }
    const best = s[BEST_T];
    const ties = t === best && (kind < s[BEST_KIND] || (kind === s[BEST_KIND] && index < s[BEST_INDEX]));
    if (t < best || ties) {
        s[BEST_T] = t;
        s[BEST_KIND] = kind;
        s[BEST_INDEX] = index;
    }
}

/**
 * @param {Float64Array} s the ray scratch, holding the origin and direction
 * @param {number} cx circle centre x
 * @param {number} cy circle centre y
 * @param {number} r circle radius
 * @returns {number} distance to the hit surface (0 from inside), or -1 for none
 */
function rayCircle(s, cx, cy, r) {
    const ox = s[OX] - cx;
    const oy = s[OY] - cy;
    const b = s[DX] * ox + s[DY] * oy;
    const c = ox * ox + oy * oy - r * r;
    const disc = b * b - c;
    if (disc < 0) {
        return -1;
    }
    const t = -b - Math.sqrt(disc);
    if (t < 0) {
        return c <= 0 ? 0 : -1;
    }
    return t;
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function testObstacles(world) {
    const { obsX, obsY, obsRadius, rayScratch: s } = world;
    for (let i = 0; i < obsX.length; i++) {
        consider(s, rayCircle(s, obsX[i], obsY[i], obsRadius[i]), OBSTACLE, i);
    }
}

/**
 * @param {number} origin ray origin on one axis
 * @param {number} dir ray direction on that axis
 * @param {number} extent world size on that axis
 * @returns {number} distance to the boundary line the ray heads for, or Infinity when parallel
 */
function wallDistance(origin, dir, extent) {
    if (dir < 0) {
        return -origin / dir;
    }
    return dir > 0 ? (extent - origin) / dir : Infinity;
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function testWalls(world) {
    const s = world.rayScratch;
    const tx = wallDistance(s[OX], s[DX], world.config.worldWidth);
    const ty = wallDistance(s[OY], s[DY], world.config.worldHeight);
    consider(s, Math.min(tx, ty), WALL, 0);
}

/**
 * Sets up the DDA on one axis.
 * @param {Float64Array} s the ray scratch
 * @param {number} axis 0 for x, 1 for y
 * @param {number} cellSize cell edge length
 * @returns {void}
 */
function setupAxis(s, axis, cellSize) {
    const origin = s[OX + axis];
    const dir = s[DX + axis];
    const cell = s[CELL_X + axis];
    if (dir === 0) {
        s[T_MAX_X + axis] = Infinity;
        s[T_STEP_X + axis] = Infinity;
        s[STEP_X + axis] = 0;
        return;
    }
    s[STEP_X + axis] = dir > 0 ? 1 : -1;
    s[T_MAX_X + axis] = ((dir > 0 ? (cell + 1) * cellSize : cell * cellSize) - origin) / dir;
    s[T_STEP_X + axis] = cellSize / Math.abs(dir);
}

/**
 * @param {number} v a coordinate
 * @param {SpatialHash} hash the hash
 * @param {number} cells cells on the axis
 * @returns {number} its clamped cell
 */
function clampCell(v, hash, cells) {
    return Math.min(cells - 1, Math.max(0, Math.floor(v / hash.cellSize)));
}

/**
 * Tests every circle in one hash cell, skipping the casting agent.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash
 * @param {number} slot the casting agent
 * @returns {void}
 */
function testCell(world, hash, slot) {
    const s = world.rayScratch;
    const cell = s[CELL_Y] * hash.cols + s[CELL_X];
    const end = hash.cellStart[cell + 1];
    for (let e = hash.cellStart[cell]; e < end; e++) {
        const id = hash.entries[e];
        if (id === slot) {
            continue;
        }
        if (id < hash.maxAgents) {
            consider(s, rayCircle(s, world.x[id], world.y[id], world.size[id]), AGENT, id);
        } else {
            const f = id - hash.maxAgents;
            consider(s, rayCircle(s, world.foodX[f], world.foodY[f], world.foodRadius[f]), FOOD, f);
        }
    }
}

/**
 * Moves the DDA to the next cell.
 * @param {Float64Array} s the ray scratch
 * @returns {void}
 */
function advance(s) {
    if (s[T_MAX_X] <= s[T_MAX_Y]) {
        s[CELL_X] += s[STEP_X];
        s[T_MAX_X] += s[T_STEP_X];
    } else {
        s[CELL_Y] += s[STEP_Y];
        s[T_MAX_Y] += s[T_STEP_Y];
    }
}

/**
 * Walks the cells the ray crosses until the nearest hit lies inside the cell just tested.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash
 * @param {number} slot the casting agent
 * @returns {void}
 */
function walkCells(world, hash, slot) {
    const s = world.rayScratch;
    s[CELL_X] = clampCell(s[OX], hash, hash.cols);
    s[CELL_Y] = clampCell(s[OY], hash, hash.rows);
    setupAxis(s, 0, hash.cellSize);
    setupAxis(s, 1, hash.cellSize);
    for (;;) {
        testCell(world, hash, slot);
        const exit = Math.min(s[T_MAX_X], s[T_MAX_Y]);
        if (s[BEST_T] <= exit || exit > s[RANGE]) {
            return;
        }
        advance(s);
        if (s[CELL_X] < 0 || s[CELL_X] >= hash.cols || s[CELL_Y] < 0 || s[CELL_Y] >= hash.rows) {
            return;
        }
    }
}

/**
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @returns {number} the channel offset of the agent hit by the current ray's best hit
 */
function agentChannel(world, slot) {
    const other = world.rayScratch[BEST_INDEX];
    if (isKin(world, slot, other)) {
        return CH_KIN;
    }
    const ratio = world.config.huntSizeRatio;
    if (world.size[other] > ratio * world.size[slot]) {
        return CH_BIGGER;
    }
    return world.size[other] < world.size[slot] / ratio ? CH_SMALLER : CH_SIMILAR;
}

/**
 * Writes the current ray's best hit as `RAY_CHANNELS` input values at `base`.
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @param {number} base index of the ray's first value in `world.inputs`
 * @returns {void}
 */
function writeRay(world, slot, base) {
    const { inputs, rayScratch: s } = world;
    inputs.fill(0, base, base + RAY_CHANNELS);
    if (s[BEST_T] === Infinity) {
        return;
    }
    inputs[base] = 1 - s[BEST_T] / s[RANGE];
    const kind = s[BEST_KIND];
    if (kind === FOOD) {
        inputs[base + CH_FOOD] = 1;
    } else if (kind === AGENT) {
        inputs[base + agentChannel(world, slot)] = 1;
    } else {
        inputs[base + (kind === WALL ? CH_WALL : CH_OBSTACLE)] = 1;
    }
}

/**
 * Casts ray `k` of an agent and writes its `RAY_CHANNELS` values.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash
 * @param {number} slot the casting agent
 * @param {number} k the ray index
 * @returns {void}
 */
function castRay(world, hash, slot, k) {
    const s = world.rayScratch;
    s[DX] = s[COS_H] * world.rayCos[k] - s[SIN_H] * world.raySin[k];
    s[DY] = s[SIN_H] * world.rayCos[k] + s[COS_H] * world.raySin[k];
    s[BEST_T] = Infinity;
    s[BEST_KIND] = WALL;
    s[BEST_INDEX] = 0;
    testObstacles(world);
    testWalls(world);
    walkCells(world, hash, slot);
    writeRay(world, slot, slot * world.layout.inputCount + k * RAY_CHANNELS);
}

/**
 * Casts all of an agent's rays and writes `rayCount x RAY_CHANNELS` values at the start of its inputs row.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built for this tick
 * @param {number} slot the alive agent
 * @returns {void}
 */
export function castRays(world, hash, slot) {
    const s = world.rayScratch;
    s[OX] = world.x[slot];
    s[OY] = world.y[slot];
    s[RANGE] = world.visionBySpec[world.spec[slot]];
    s[COS_H] = detCos(world.angle[slot]);
    s[SIN_H] = detSin(world.angle[slot]);
    for (let k = 0; k < world.config.rayCount; k++) {
        castRay(world, hash, slot, k);
    }
}
