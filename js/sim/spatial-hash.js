// Uniform-grid spatial hash over agent and food circles, rebuilt each tick by a counting sort in the WASM kernels
// (wasm/src/hash.rs). The arrays live in the world's arena (`arenaHash` in wasm-hash.js); this module keeps the query
// helpers the JS rules use.

import { buildHashKernel, hashShape } from './wasm-hash.js';

/**
 * @typedef {object} SpatialHash
 * @property {number} cellSize cell edge length in world units
 * @property {number} cols columns
 * @property {number} rows rows
 * @property {number} maxAgents agent slot count; food ids start here
 * @property {Int32Array} cellStart `cols * rows + 1` offsets into `entries`
 * @property {Int32Array} entries circle ids, grouped by cell
 * @property {Float64Array} boxX per entry, the circle's `minX` at build time
 * @property {Float64Array} boxY per entry, the circle's `minY` at build time
 * @property {Int32Array} range `[col0, row0, col1, row1]` written by `cellRange`
 * @property {number} entryCount entries used by the last build
 */

/**
 * A hash for a world of this config that no build has bound yet: empty cells and no entries. Every world gets its own
 * hash over its arena at birth (`world.hash`); tests and tools that want a separate handle make one here and pass it to
 * `buildHash`, which binds it to the world's arrays.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {SpatialHash}
 */
export function createSpatialHash(config) {
    const { cellSize, cols, rows } = hashShape(config);
    return {
        cellSize,
        cols,
        rows,
        maxAgents: config.maxAgents,
        cellStart: new Int32Array(cols * rows + 1),
        entries: new Int32Array(0),
        boxX: new Float64Array(0),
        boxY: new Float64Array(0),
        range: new Int32Array(4),
        entryCount: 0,
    };
}

/**
 * Clamped cell coordinate of a world coordinate.
 * @param {number} v the coordinate
 * @param {number} cellSize cell edge length
 * @param {number} last the last valid cell index
 * @returns {number}
 */
export function cellOf(v, cellSize, last) {
    const c = Math.floor(v / cellSize);
    return c < 0 ? 0 : c > last ? last : c;
}

/**
 * Writes the cell box `[col0, row0, col1, row1]` that a circle's bounding box covers into `hash.range`.
 * The result is shared: finish with it before calling again.
 * @param {SpatialHash} hash the hash
 * @param {number} x circle centre x
 * @param {number} y circle centre y
 * @param {number} r circle radius
 * @returns {Int32Array} `hash.range`
 */
export function cellRange(hash, x, y, r) {
    const range = hash.range;
    range[0] = cellOf(x - r, hash.cellSize, hash.cols - 1);
    range[1] = cellOf(y - r, hash.cellSize, hash.rows - 1);
    range[2] = cellOf(x + r, hash.cellSize, hash.cols - 1);
    range[3] = cellOf(y + r, hash.cellSize, hash.rows - 1);
    return range;
}

/**
 * Rebuilds the world's hash from its live agents and food in the WASM kernel (`build_hash`, wasm/src/hash.rs): agents by
 * ascending slot (id `slot`), then food (id `maxAgents + slot`), each in every cell its bounding box covers. Allocates
 * nothing. A hash other than `world.hash` (one a test or tool made with `createSpatialHash`) is bound to the world's
 * arrays, so it reads this build.
 * @param {SpatialHash} hash the hash to bind the build to: `world.hash`, or one made for this world's config
 * @param {Record<string, any>} world a world on the WASM kernels
 * @throws {Error} when the entries would overflow the capacity of nine cells per circle
 */
export function buildHash(hash, world) {
    const own = world.hash;
    const total = buildHashKernel(world);
    if (total > own.entries.length) {
        throw new Error(`spatial hash needs ${total} entries but holds ${own.entries.length}`);
    }
    own.entryCount = total;
    if (hash !== own) {
        Object.assign(hash, { ...own, range: hash.range });
    }
}
