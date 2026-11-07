// The spatial hash build in the WASM kernels (docs/designs/wasm-kernels.md, Phase 4): one `build_hash` call per build
// writes the counting sort into arena arrays, bit-identical to the JS `buildHash` it replaced. The world's hash
// (`world.hash`) is a descriptor over those arena views, so the sense kernel reads the cells in place and the JS
// readers (contacts, feeding, mating, calls, disease) read the same memory.

/** World fields the hash kernel reads that no earlier kernel took into the arena. */
export const HASH_FIELDS = Object.freeze(['foodAlive']);

/** The arena arrays whose byte offsets head the hash parameter block, in `HashParams` order (wasm/src/hash.rs). */
export const HASH_ARRAYS = Object.freeze([
    'alive',
    'x',
    'y',
    'size',
    'foodAlive',
    'foodX',
    'foodY',
    'foodRadius',
    'cellStart',
    'cellCount',
    'entries',
    'boxX',
    'boxY',
    'circleRange',
]);

/** Words of the hash parameter block after the offsets, in `HashParams` order. */
const WORDS = Object.freeze(['maxAgents', 'maxFood', 'cols', 'rows', 'capacity']);

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {{ cellSize: number, cols: number, rows: number, capacity: number, circles: number }} the grid's shape and
 *   the entry capacity, the worst case of nine cells per circle
 */
export function hashShape(config) {
    const cellSize = config.hashCellSize;
    const circles = config.maxAgents + config.maxFood;
    return {
        cellSize,
        cols: Math.ceil(config.worldWidth / cellSize),
        rows: Math.ceil(config.worldHeight / cellSize),
        capacity: 9 * circles,
        circles,
    };
}

/**
 * @param {Record<string, any>} world the world, its fields not yet in an arena
 * @returns {import('./wasm-arena.js').ArenaSpec[]} the hash arrays: `foodAlive` at its own type and length, the grid
 *   and entry arrays, the kernel's scratch and the parameter block
 */
export function hashSpecs(world) {
    const { cols, rows, capacity, circles } = hashShape(world.config);
    return [
        ...HASH_FIELDS.map((name) => /** @type {any} */ ([name, world[name].constructor, world[name].length])),
        ['cellStart', Int32Array, cols * rows + 1],
        ['cellCount', Int32Array, cols * rows],
        ['entries', Int32Array, capacity],
        ['boxX', Float64Array, capacity],
        ['boxY', Float64Array, capacity],
        ['circleRange', Int32Array, 4 * circles],
        ['hashParams', Int32Array, HASH_ARRAYS.length + WORDS.length],
    ];
}

/**
 * Writes the hash parameter block and returns the world's hash, a descriptor over the arena's arrays.
 * @param {import('./wasm-arena.js').Arena} arena the arena
 * @param {Record<string, any>} world the world the arena is for
 * @param {Record<string, any>} [previous] the hash of the world this one copies (a bench copy): its last build is
 *   carried over
 * @returns {import('./spatial-hash.js').SpatialHash} the world's hash
 */
export function arenaHash(arena, world, previous) {
    const { config } = world;
    const { cellSize, cols, rows, capacity } = hashShape(config);
    const { views } = arena;
    views.hashParams.set([
        ...HASH_ARRAYS.map((name) => arena.offsets[name]),
        config.maxAgents,
        config.maxFood,
        cols,
        rows,
        capacity,
    ]);
    let entryCount = 0;
    if (previous !== undefined) {
        for (const name of ['cellStart', 'entries', 'boxX', 'boxY']) {
            views[name].set(previous[name]);
        }
        entryCount = previous.entryCount;
    }
    return {
        cellSize,
        cols,
        rows,
        maxAgents: config.maxAgents,
        cellStart: views.cellStart,
        entries: views.entries,
        boxX: views.boxX,
        boxY: views.boxY,
        range: new Int32Array(4),
        entryCount,
    };
}

/**
 * Throws unless `hash` reads the world's own arena arrays (`world.hash`, or a hash `buildHash` bound to the world), so a
 * kernel that reads the arena hash reads the hash its caller means.
 * @param {Record<string, any>} world a world on the WASM kernels
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash the caller passed
 * @param {string} caller the function name for the message
 * @returns {void}
 */
export function assertArenaHash(world, hash, caller) {
    if (hash.cellStart !== world.wasm.views.cellStart) {
        throw new Error(`${caller}: the hash is not the world's own; build it with buildHash(hash, world) first`);
    }
}

/**
 * Runs the build kernel on the world's live agents and food.
 * @param {Record<string, any>} world a world on the WASM kernels
 * @returns {number} the entry total the build needed; above the capacity, nothing was inserted
 */
export function buildHashKernel(world) {
    const arena = world.wasm;
    return arena.exports.build_hash(arena.offsets.hashParams, world.hash.cellSize);
}
