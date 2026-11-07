// The ray march in the WASM kernels (docs/designs/wasm-kernels.md, Phase 2): one `sense_slot` call gathers a casting
// agent's circles and finds every ray's nearest hit, bit-identical to the JS gather and nearest-hit loops it
// replaced (deleted at T11). The circles' arrays and the spatial hash (built in the arena by `build_hash`, Phase 4) are
// read in place. The hit classes, the mate sighting and the body and scent inputs are rules and stay in JS.

import { hashShape } from './wasm-hash.js';

/** World fields the sense kernel reads or writes, taken over by the arena at their allocated type and length. */
export const SENSE_FIELDS = Object.freeze([
    'x',
    'y',
    'size',
    'foodX',
    'foodY',
    'foodRadius',
    'obsX',
    'obsY',
    'obsRadius',
    'herdAlive',
    'herdX',
    'herdY',
    'cloudX',
    'cloudY',
    'coverRing',
    'rayLocal',
    'rayStamp',
    'rayScratch',
]);

/** The arena arrays whose byte offsets head the sense parameter block, in `SenseParams` order (wasm/src/sense.rs). */
export const SENSE_ARRAYS = Object.freeze([
    'rayScratch',
    'rayStamp',
    'rayLocal',
    'rayBestT',
    'rayBestKey',
    'rayDirs',
    'x',
    'y',
    'size',
    'foodX',
    'foodY',
    'foodRadius',
    'obsX',
    'obsY',
    'obsRadius',
    'herdAlive',
    'herdX',
    'herdY',
    'cloudX',
    'cloudY',
    'coverRing',
    'rayCos',
    'raySin',
    'cellStart',
    'entries',
    'senseDoubles',
]);

/** Words of the sense parameter block after the offsets, by name, in `SenseParams` order. */
const WORDS = Object.freeze([
    'maxAgents',
    'stampCount',
    'obsCount',
    'herdMax',
    'cloudCount',
    'rayCount',
    'cols',
    'rows',
    'conceals',
    'concealed',
]);

/** Index of each named word in the sense parameter block. */
export const SENSE_WORD = Object.freeze(Object.fromEntries(WORDS.map((name, i) => [name, SENSE_ARRAYS.length + i])));

/** Indices into `senseDoubles`. */
const D_SMOKE_RADIUS = 0;
const D_HERD_RADIUS = 1;
const D_WIDTH = 2;
const D_HEIGHT = 3;
const D_CELL_SIZE = 4;

/**
 * @param {Record<string, any>} world the world, its fields not yet in an arena
 * @returns {import('./wasm-arena.js').ArenaSpec[]} the sense arrays: the world's at their own type and length, then the
 *   kernel's per-ray results and the parameter blocks (the hash arrays it reads are `hashSpecs`')
 */
export function senseSpecs(world) {
    const { config } = world;
    return [
        ...SENSE_FIELDS.map((name) => /** @type {any} */ ([name, world[name].constructor, world[name].length])),
        ['rayBestT', Float64Array, config.rayCount],
        ['rayBestKey', Float64Array, config.rayCount],
        ['rayDirs', Float64Array, 2 * config.rayCount],
        ['senseParams', Int32Array, SENSE_ARRAYS.length + WORDS.length],
        ['senseDoubles', Float64Array, 5],
    ];
}

/**
 * Writes the sense parameter block's fixed part: the offsets, the sizes and the radii.
 * @param {import('./wasm-arena.js').Arena} arena the arena
 * @param {Record<string, any>} world the world the arena is for
 * @returns {void}
 */
export function writeSenseParams(arena, world) {
    const { config } = world;
    const { senseParams: p, senseDoubles: d } = arena.views;
    p.set(SENSE_ARRAYS.map((name) => arena.offsets[name]));
    p[SENSE_WORD.maxAgents] = config.maxAgents;
    p[SENSE_WORD.stampCount] = world.rayStamp.length;
    p[SENSE_WORD.obsCount] = world.obsX.length;
    p[SENSE_WORD.herdMax] = world.herdMax;
    p[SENSE_WORD.rayCount] = config.rayCount;
    const { cols, rows, cellSize } = hashShape(config);
    p[SENSE_WORD.cols] = cols;
    p[SENSE_WORD.rows] = rows;
    d[D_CELL_SIZE] = cellSize;
    d[D_SMOKE_RADIUS] = config.smokeRadius;
    d[D_HERD_RADIUS] = config.herdRadius;
    d[D_WIDTH] = config.worldWidth;
    d[D_HEIGHT] = config.worldHeight;
}

/**
 * Records the per-tick words before a tick's casts, and checks the casts will read the hash the caller means: the
 * world's own, built in the arena (a hash bound to it by `buildHash` shares its arrays).
 * @param {Record<string, any>} world a world on the WASM kernels
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built for this tick
 * @returns {void}
 * @throws {Error} when the hash does not read the world's arena arrays
 */
export function beginSense(world, hash) {
    const { views } = world.wasm;
    if (hash.cellStart !== views.cellStart) {
        throw new Error("beginSense: the hash is not the world's own; build it with buildHash(hash, world) first");
    }
    const p = views.senseParams;
    p[SENSE_WORD.cloudCount] = world.cloudCount;
    // Rings conceal: `refugeCentres` is placed by `createWorld`, after the arena is built.
    p[SENSE_WORD.conceals] = world.refugeCentres.length > 0 ? 1 : 0;
}

/**
 * Gathers one caster's circles and finds every ray's nearest hit into `rayBestT` and `rayBestKey`. The caster's origin,
 * range and heading must already be in `world.rayScratch`.
 * @param {Record<string, any>} world a world on the WASM kernels, begun by `beginSense` this tick
 * @param {number} slot the casting agent
 * @returns {number} the gathered row count in `world.rayLocal`
 */
export function senseSlot(world, slot) {
    const arena = world.wasm;
    return arena.exports.sense_slot(arena.offsets.senseParams, slot);
}
