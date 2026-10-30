// Static terrain (`terrainLayout` `basins`): a wall of touching rocks across the middle with gaps, refuges ringed by
// rocks too tight for large agents, and a cold margin along the north and south edges. The rocks are obstacles that
// never move, stored after the wandering ones. Nothing here runs, and no random number is drawn, when the layout is
// `open`.

import { detCos, detSin } from './det-math.js';
import { nextFloat } from './rng.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {Readonly<Record<string, any>>} Config */

/** Rocks in a refuge ring. */
export const REFUGE_ROCKS = 8;
/** Radius of a refuge rock. */
export const REFUGE_ROCK_RADIUS = 50;
/** The most wall gaps or refuges. */
export const TERRAIN_MAX = 8;
const WALL_ROCK_TARGET = 100;
const RING_HALF_ANGLE_SIN = 0.3826834323650898; // sin(pi / 8), half the angle between neighbouring rocks
const TWO_PI = 6.283185307179586;

/**
 * @param {Config} config the config
 * @returns {boolean} whether the config builds terrain
 */
export function hasTerrain(config) {
    return config.terrainLayout === 'basins';
}

/**
 * @param {Config} config the config
 * @returns {{count: number, step: number, gapRocks: number}} the wall: rock positions along it, their spacing (also
 *   their radius, so neighbours touch) and the positions removed per gap
 */
function wallShape(config) {
    const count = Math.ceil(config.worldHeight / WALL_ROCK_TARGET);
    const step = config.worldHeight / count;
    return { count, step, gapRocks: Math.ceil(config.wallGapWidth / step) + 1 };
}

/**
 * @param {Config} config the config
 * @returns {number} the static rocks the layout adds: zero when open
 */
export function terrainRockCount(config) {
    if (!hasTerrain(config)) {
        return 0;
    }
    const { count, gapRocks } = wallShape(config);
    return count - config.wallGaps * gapRocks + config.refugeCount * REFUGE_ROCKS;
}

/**
 * @param {Config} config the config
 * @returns {number} the obstacle slots: the wandering obstacles, then the static rocks
 */
export function obstacleSlots(config) {
    return config.obstacleCount + terrainRockCount(config);
}

/**
 * @param {Config} config the config
 * @returns {number} the distance from a refuge's centre to its rocks, so the gap between neighbours is as wide as
 *   an agent of `refugeSizeMax`
 */
export function ringRadius(config) {
    return (REFUGE_ROCK_RADIUS + config.refugeSizeMax) / RING_HALF_ANGLE_SIN;
}

/**
 * @param {Config} config the config
 * @returns {string | null} what is wrong with the terrain keys, or null when they fit the world
 */
export function terrainProblem(config) {
    if (!hasTerrain(config)) {
        return null;
    }
    if (config.obstacleCount > 0) {
        return 'obstacleCount must be 0 when terrainLayout is basins (wandering obstacles stay off)';
    }
    const { count, step, gapRocks } = wallShape(config);
    if (config.wallGaps > 0 && Math.floor(count / config.wallGaps) < gapRocks + 2) {
        return `wallGaps ${config.wallGaps} of ${config.wallGapWidth} px leave no wall between them`;
    }
    return refugeProblem(config, step) ?? patchProblem(config, step);
}

/**
 * @param {Config} config the config
 * @param {number} step the wall rock radius
 * @returns {string | null} what is wrong with the refuges or the cold margin, or null
 */
function refugeProblem(config, step) {
    const m = ringRadius(config) + REFUGE_ROCK_RADIUS;
    const perBasin = Math.ceil(config.refugeCount / 2);
    const basinTooNarrow = config.worldWidth / 2 - step < 2 * m;
    if (config.refugeCount > 0 && (basinTooNarrow || config.worldHeight / perBasin < 2 * m)) {
        return `${config.refugeCount} refuges of size ${config.refugeSizeMax} do not fit the basins`;
    }
    return 2 * config.coldMarginWidth >= config.worldHeight
        ? 'coldMarginWidth must leave room between the two cold margins'
        : null;
}

/**
 * @param {Config} config the config
 * @param {number} step the wall rock radius
 * @returns {string | null} what is wrong with the food patch size for a basin, or null
 */
function patchProblem(config, step) {
    const tooWide = config.worldWidth / 2 - step < 2 * config.foodPatchRadius;
    return config.foodPatchCount > 0 && tooWide
        ? `foodPatchRadius ${config.foodPatchRadius} does not fit a basin`
        : null;
}

/**
 * Writes the wall rocks, `wallGaps` gaps of whole rocks, one in each equal band along the wall.
 * @param {World} world the world
 * @param {number} first the first slot to write
 * @returns {number} the next free slot
 */
function placeWall(world, first) {
    const { wallGaps, worldWidth } = world.config;
    const { count, step, gapRocks } = wallShape(world.config);
    const band = wallGaps > 0 ? Math.floor(count / wallGaps) : count;
    const rng = world.rng.obstacles;
    const gapStart = new Int32Array(wallGaps);
    for (let g = 0; g < wallGaps; g++) {
        gapStart[g] = g * band + Math.floor(nextFloat(rng) * (band - gapRocks + 1));
    }
    let slot = first;
    for (let j = 0; j < count; j++) {
        let open = false;
        for (let g = 0; g < wallGaps; g++) {
            open = open || (j >= gapStart[g] && j < gapStart[g] + gapRocks);
        }
        if (!open) {
            world.obsX[slot] = worldWidth / 2;
            world.obsY[slot] = (j + 0.5) * step;
            world.obsRadius[slot] = step;
            slot++;
        }
    }
    return slot;
}

/**
 * Writes the refuges, alternating between the two basins; those in one basin share its height in equal bands.
 * @param {World} world the world
 * @param {number} first the first slot to write
 * @returns {number} the next free slot
 */
function placeRefuges(world, first) {
    const { refugeCount, worldWidth, worldHeight } = world.config;
    const ring = ringRadius(world.config);
    const m = ring + REFUGE_ROCK_RADIUS;
    const wallEdge = wallShape(world.config).step;
    const band = worldHeight / Math.ceil(refugeCount / 2);
    const rng = world.rng.obstacles;
    let slot = first;
    for (let i = 0; i < refugeCount; i++) {
        const left = i % 2 === 0;
        const x0 = left ? m : worldWidth / 2 + wallEdge + m;
        const x1 = left ? worldWidth / 2 - wallEdge - m : worldWidth - m;
        const cx = x0 + nextFloat(rng) * (x1 - x0);
        const cy = Math.floor(i / 2) * band + m + nextFloat(rng) * (band - 2 * m);
        for (let r = 0; r < REFUGE_ROCKS; r++) {
            const angle = (r / REFUGE_ROCKS) * TWO_PI;
            world.obsX[slot] = cx + ring * detCos(angle);
            world.obsY[slot] = cy + ring * detSin(angle);
            world.obsRadius[slot] = REFUGE_ROCK_RADIUS;
            slot++;
        }
    }
    return slot;
}

/**
 * Fills the static rock slots (after the wandering obstacles) from the `obstacles` stream; does nothing when open.
 * @param {World} world the world
 * @returns {void}
 */
export function placeTerrain(world) {
    if (hasTerrain(world.config)) {
        placeRefuges(world, placeWall(world, world.config.obstacleCount));
    }
}

/**
 * @param {Config} config the config
 * @param {number} y an agent's y
 * @returns {number} the factor on passive temperature loss: 2 in the cold margin of `basins`, otherwise 1
 */
export function coldFactor(config, y) {
    const cold = y < config.coldMarginWidth || y > config.worldHeight - config.coldMarginWidth;
    return hasTerrain(config) && cold ? 2 : 1;
}

/**
 * Maps a unit draw to a patch centre x inside a basin: patches alternate between the left and right basin and keep
 * their whole disc off the wall.
 * @param {Config} config the config
 * @param {number} index the patch index
 * @param {number} unit a float in [0, 1)
 * @returns {number} the centre x
 */
export function basinPatchX(config, index, unit) {
    const radius = config.foodPatchRadius;
    const half = config.worldWidth / 2;
    const edge = wallShape(config).step + radius;
    const low = index % 2 === 0 ? radius : half + edge;
    const high = index % 2 === 0 ? half - edge : config.worldWidth - radius;
    return low + unit * (high - low);
}
