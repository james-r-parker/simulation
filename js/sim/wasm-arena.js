// The WASM kernels' memory (docs/designs/wasm-kernels.md): one fixed-size memory per world, sized from `maxAgents`, the
// brain layout and `rayCount` at instantiation and never grown (growth would detach every view). Each hot array lives
// at a 16-byte aligned offset, and `attachWasm` re-points the world's fields at views over those bytes, so the JS rules
// and the kernels read and write the same memory.

import { writeBrainParams } from './wasm-brain.js';
import { KERNEL_ABI } from './wasm-loader.js';
import { hasHashViews } from './world-hash.js';

/** Bytes per WebAssembly page. */
export const PAGE_BYTES = 65536;

/** The largest memory an arena asks for: 1 GiB. A bigger world falls back to the JS kernels. */
export const MAX_PAGES = 16384;

/** Every array starts on a 16-byte boundary, so a `v128` load of its head is aligned. */
export const ALIGN = 16;

/** Int32 words in the brain kernel's parameter block (`Params` in wasm/src/brain.rs). */
export const PARAM_WORDS = 40;

/** Float64 values in the brain kernel's parameter block. */
export const PARAM_DOUBLES = 4;

/** World fields the arena takes over; every other entry in `arenaSpecs` is the kernels' own. */
export const WORLD_FIELDS = Object.freeze([
    'alive',
    'weights',
    'hidden',
    'inputs',
    'pooled',
    'outputs',
    'leakRate',
    'fastOut',
    'rayHue',
    'rayCos',
    'raySin',
]);

/** @typedef {[string, Float64ArrayConstructor | Float32ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor, number]} ArenaSpec */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {ArenaSpec[]} each array's name, element type and length, in allocation order
 */
export function arenaSpecs(config, layout) {
    const n = config.maxAgents;
    const H = layout.hidden;
    return [
        ['alive', Uint8Array, n],
        ['weights', Float32Array, n * layout.weightCount],
        ['hidden', Float32Array, (n + 1) * H],
        ['inputs', Float32Array, n * layout.rawInputCount],
        ['pooled', Float32Array, n * layout.inputCount],
        ['outputs', Float32Array, n * layout.outputCount],
        ['leakRate', Float32Array, n * H],
        ['fastOut', Float32Array, n * H * layout.geneOutputs],
        ['rayHue', Float32Array, n * config.rayCount],
        ['rayCos', Float64Array, config.rayCount],
        ['raySin', Float64Array, config.rayCount],
        ['rewardScale', Float64Array, n],
        ['scratch', Float64Array, 2 * H + 2 * layout.geneOutputs + layout.outputCount + layout.inputCount],
        ['geneOutputIndex', Int32Array, layout.geneOutputs],
        ['terms', Int32Array, layout.inputCount + H],
        ['params', Int32Array, PARAM_WORDS],
        ['paramDoubles', Float64Array, PARAM_DOUBLES],
    ];
}

/**
 * @param {number} x a byte count
 * @returns {number} x rounded up to `ALIGN`
 */
function align(x) {
    return Math.ceil(x / ALIGN) * ALIGN;
}

/**
 * Lays the arrays out from `start`, each at an aligned offset.
 * @param {ArenaSpec[]} specs the arrays
 * @param {number} start the first free byte (the kernel's `__heap_base`)
 * @returns {{ offsets: Record<string, number>, end: number }} each array's byte offset, and the first byte after them
 */
export function layoutArena(specs, start) {
    /** @type {Record<string, number>} */
    const offsets = {};
    let at = align(start);
    for (const [name, Type, length] of specs) {
        offsets[name] = at;
        at = align(at + length * Type.BYTES_PER_ELEMENT);
    }
    return { offsets, end: at };
}

/** An arena that could not be built, with the `WasmFallback` reason. */
export class WasmArenaError extends Error {
    /**
     * @param {'memory' | 'instantiate'} reason the fallback reason
     * @param {string} message what went wrong
     */
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}

/**
 * @typedef {{
 *   exports: Record<string, any>,
 *   memory: WebAssembly.Memory,
 *   offsets: Record<string, number>,
 *   views: Record<string, any>,
 * }} Arena
 */

/**
 * Instantiates the kernels with a memory big enough for every array, requested whole up front.
 * @param {WebAssembly.Module} module the compiled kernels (`loadKernels`)
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {Arena} the arena, with one typed-array view per array
 * @throws {WasmArenaError} when the arrays need more than `MAX_PAGES`, or the binary's ABI is not `KERNEL_ABI`
 */
export function createArena(module, config, layout) {
    const specs = arenaSpecs(config, layout);
    const probe = new WebAssembly.Instance(module, { env: { memory: new WebAssembly.Memory({ initial: 1 }) } });
    const heapBase = /** @type {WebAssembly.Global} */ (probe.exports.__heap_base).value;
    const { offsets, end } = layoutArena(specs, heapBase);
    const pages = Math.ceil(end / PAGE_BYTES);
    if (pages > MAX_PAGES) {
        throw new WasmArenaError('memory', `wasm arena: ${pages} pages needed, the limit is ${MAX_PAGES}`);
    }
    const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
    const instance = new WebAssembly.Instance(module, { env: { memory } });
    const abi = /** @type {() => number} */ (instance.exports.abi_version)();
    if (abi !== KERNEL_ABI) {
        throw new WasmArenaError('instantiate', `wasm arena: kernel ABI ${abi}, expected ${KERNEL_ABI}`);
    }
    /** @type {Record<string, any>} */
    const views = {};
    for (const [name, Type, length] of specs) {
        views[name] = new Type(memory.buffer, offsets[name], length);
    }
    return { exports: instance.exports, memory, offsets, views };
}

/**
 * @param {Record<string, any>} world the world, its fields not yet re-pointed
 * @param {any} array an agent row's array
 * @returns {string | undefined} the world field the row is, by identity; the hidden row is the field's head, so it
 *   matches by buffer and offset. Matching by buffer alone would map every row to `alive` once the fields share one
 *   arena.
 */
function rowField(world, array) {
    const name = WORLD_FIELDS.find((field) => world[field] === array);
    if (name !== undefined) {
        return name;
    }
    const { hidden } = world;
    const isHidden = array.buffer === hidden.buffer && array.byteOffset === hidden.byteOffset;
    return isHidden && array.length === world.config.maxAgents * world.layout.hidden ? 'hidden' : undefined;
}

/**
 * Points each world-owned entry of `world.agentRows` at its arena view (the hidden entry excludes the scratch row).
 * @param {Record<string, any>} world the world, its fields not yet re-pointed
 * @param {Arena} arena the arena
 * @returns {void}
 */
function repointRows(world, arena) {
    const n = world.config.maxAgents;
    for (const row of world.agentRows) {
        const name = rowField(world, row.array);
        if (name === 'hidden') {
            row.array = arena.views.hidden.subarray(0, n * world.layout.hidden);
        } else if (name !== undefined) {
            row.array = arena.views[name];
        }
    }
}

/**
 * Throws for a world that cannot be attached safely: one already on the kernels, one `hashWorld` has cached views of
 * (the hash would keep reading the JS arrays), or one past tick 0 unless the caller says it knows (`midRun`, for the
 * bench's warmed-up worlds).
 * @param {Record<string, any>} world the world
 * @param {boolean} midRun whether a world past tick 0 is allowed
 * @returns {void}
 */
function refuseAttach(world, midRun) {
    if (world.wasm !== undefined) {
        throw new Error('attachWasm: the world already runs the WASM kernels');
    }
    if (hasHashViews(world)) {
        throw new Error('attachWasm: the world was already hashed; attach before the first hashWorld');
    }
    if (world.tick > 0 && !midRun) {
        throw new Error(`attachWasm: the world is past tick 0 (tick ${world.tick}); attach right after createWorld`);
    }
}

/**
 * Builds the world's arena, or logs why it cannot and returns null.
 * @param {Record<string, any>} world the world
 * @param {import('./wasm-loader.js').Kernels} kernels the result of `loadKernels`
 * @param {{ log: (level: string, event: string, fields: object) => void } | undefined} log the fallback log
 * @returns {Arena | null} the arena, or null after one `WasmFallback` warning
 */
function buildArena(world, kernels, log) {
    if (!kernels.ok) {
        log?.log('warn', 'WasmFallback', { reason: kernels.reason, detail: kernels.detail });
        return null;
    }
    try {
        return createArena(kernels.module, world.config, world.layout);
    } catch (error) {
        const reason = error instanceof WasmArenaError ? error.reason : 'instantiate';
        log?.log('warn', 'WasmFallback', { reason, detail: String(/** @type {Error} */ (error).message) });
        return null;
    }
}

/**
 * Moves the world's hot arrays into a new arena and turns the WASM kernels on. With `wasmKernels` false nothing
 * changes. When the kernels are missing or the arena cannot be built, the world keeps its JS arrays and kernels and a
 * `WasmFallback` warning is logged. A cloned or restored world calls this again; attaching a world that already runs the
 * kernels throws. A shallow copy needs its own `agentRows` entries, which are re-pointed at its arena.
 * @param {Record<string, any>} world a world from `createWorld`
 * @param {import('./wasm-loader.js').Kernels} kernels the result of `loadKernels`
 * @param {{
 *   wasmKernels?: boolean,
 *   midRun?: boolean,
 *   log?: { log: (level: string, event: string, fields: object) => void },
 * }} [options] the switch, whether a world past tick 0 may be attached, and the log the fallback warning goes to
 * @returns {boolean} whether the world now runs the WASM kernels
 */
export function attachWasm(world, kernels, { wasmKernels = false, midRun = false, log } = {}) {
    if (!wasmKernels) {
        return false;
    }
    refuseAttach(world, midRun);
    const arena = buildArena(world, kernels, log);
    if (arena === null) {
        return false;
    }
    writeBrainParams(arena, world.config, world.layout);
    repointRows(world, arena);
    for (const name of WORLD_FIELDS) {
        arena.views[name].set(world[name]);
        world[name] = arena.views[name];
    }
    world.wasm = arena;
    return true;
}
