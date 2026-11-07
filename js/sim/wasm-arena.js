// The WASM kernels' memory (docs/designs/wasm-kernels.md): one fixed-size memory per world, sized from the world's own
// `maxAgents`, brain layout and `rayCount` and never grown (growth would detach every view). Each hot array lives at a
// 16-byte aligned offset, and `attachWasm` re-points the world's fields at views over those bytes, so the JS rules and
// the kernels read and write the same memory. `allocateWorld` attaches every world as it is born.

import { writeBrainParams } from './wasm-brain.js';
import { FIELD_FIELDS, fieldSpecs, writeFieldParams } from './wasm-field.js';
import { HASH_FIELDS, arenaHash, hashSpecs } from './wasm-hash.js';
import { PHYSICS_FIELDS, physicsSpecs, writePhysicsParams } from './wasm-physics.js';
import { SENSE_FIELDS, senseSpecs, writeSenseParams } from './wasm-sense.js';
import { embeddedKernels } from './wasm-loader.js';
import { hasHashViews } from './world-hash.js';

/** Bytes per WebAssembly page. */
export const PAGE_BYTES = 65536;

/** The largest memory an arena asks for: 1 GiB. A bigger world fails at birth. */
export const MAX_PAGES = 16384;

/** Every array starts on a 16-byte boundary, so a `v128` load of its head is aligned. */
export const ALIGN = 16;

/** Int32 words in the brain kernel's parameter block (`Params` in wasm/src/brain.rs). */
export const PARAM_WORDS = 40;

/** Float64 values in the brain kernel's parameter block. */
export const PARAM_DOUBLES = 4;

/** World fields of the brain kernel; every other entry in `arenaSpecs` is the kernels' own. */
export const BRAIN_FIELDS = Object.freeze([
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

/** Every world field the arena takes over: the brain kernel's, then the sense, hash, field and physics kernels'. */
export const WORLD_FIELDS = Object.freeze([
    ...BRAIN_FIELDS,
    ...SENSE_FIELDS,
    ...HASH_FIELDS,
    ...FIELD_FIELDS,
    ...PHYSICS_FIELDS,
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
 * @param {import('./wasm-loader.js').Kernels} kernels the compiled kernels and their `__heap_base`
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @param {ArenaSpec[]} [extra] more arrays after the brain's (the other kernels', from `senseSpecs`, `hashSpecs`,
 *   `fieldSpecs` and `physicsSpecs`)
 * @returns {Arena} the arena, with one typed-array view per array
 * @throws {Error} when the arrays need more than `MAX_PAGES`
 */
export function createArena(kernels, config, layout, extra = []) {
    const specs = [...arenaSpecs(config, layout), ...extra];
    const { offsets, end } = layoutArena(specs, kernels.heapBase);
    const pages = Math.ceil(end / PAGE_BYTES);
    if (pages > MAX_PAGES) {
        throw new Error(`wasm arena: ${pages} pages needed, the limit is ${MAX_PAGES}`);
    }
    const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
    const instance = new WebAssembly.Instance(kernels.module, { env: { memory } });
    /** @type {Record<string, any>} */
    const views = {};
    for (const [name, Type, length] of specs) {
        views[name] = new Type(memory.buffer, offsets[name], length);
    }
    return { exports: instance.exports, memory, offsets, views };
}

/**
 * @param {Record<string, any>} world the world, its fields not yet re-pointed
 * @param {Map<any, string>} fields each world field's array, mapped to its name
 * @param {any} array an agent row's array
 * @returns {string | undefined} the world field the row is, by identity; the hidden row is the field's head, so it
 *   matches by buffer and offset. Matching by buffer alone would map every row to `alive` once the fields share one
 *   arena.
 */
function rowField(world, fields, array) {
    const name = fields.get(array);
    if (name !== undefined) {
        return name;
    }
    const { hidden } = world;
    const isHidden = array.buffer === hidden.buffer && array.byteOffset === hidden.byteOffset;
    return isHidden && array.length === world.config.maxAgents * world.layout.hidden ? 'hidden' : undefined;
}

/**
 * Points each world-owned entry of `world.agentRows` and `world.foodRows` at its arena view (the hidden entry excludes
 * the scratch row), so freeing a slot clears the arena bytes.
 * The fields are looked up in a map, not by a scan per row: small worlds are born by the thousand in the drills.
 * @param {Record<string, any>} world the world, its fields not yet re-pointed
 * @param {Arena} arena the arena
 * @returns {void}
 */
function repointRows(world, arena) {
    const n = world.config.maxAgents;
    const fields = new Map(WORLD_FIELDS.map((name) => [world[name], name]));
    for (const row of [...world.agentRows, ...world.foodRows]) {
        const name = rowField(world, fields, row.array);
        if (name === 'hidden') {
            row.array = arena.views.hidden.subarray(0, n * world.layout.hidden);
        } else if (name !== undefined) {
            row.array = arena.views[name];
        }
    }
}

/**
 * Throws for a world that cannot be attached safely: one already on the kernels, one `hashWorld` has cached views of
 * (the hash would keep reading the old arrays), or one past tick 0 unless the caller says it knows (`midRun`, for a
 * copy of a running world with its own arena, as the benches make).
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
 * Moves the world's hot arrays into a new arena, sized for this world, and sets `world.wasm` and `world.hash` (the
 * spatial hash over the arena; a copy keeps its source's last build). `allocateWorld` calls it
 * for every world; a copy of a world that wants its own arena (its `wasm` deleted, its own `agentRows` and `foodRows`
 * entries) calls it again with `midRun`. Fails loudly: there is no JS kernel to fall back to.
 * @param {Record<string, any>} world a world from `allocateWorld`, or such a copy
 * @param {import('./wasm-loader.js').Kernels} [kernels] the compiled kernels (the embedded ones by default)
 * @param {{ midRun?: boolean }} [options] whether a world past tick 0 may be attached
 * @returns {true} always; anything else throws
 */
export function attachWasm(world, kernels = embeddedKernels(), { midRun = false } = {}) {
    refuseAttach(world, midRun);
    const extra = [...senseSpecs(world), ...hashSpecs(world), ...fieldSpecs(world), ...physicsSpecs(world)];
    const arena = createArena(kernels, world.config, world.layout, extra);
    writeBrainParams(arena, world.config, world.layout);
    writeSenseParams(arena, world);
    writeFieldParams(arena, world);
    repointRows(world, arena);
    for (const name of WORLD_FIELDS) {
        arena.views[name].set(world[name]);
        world[name] = arena.views[name];
    }
    world.hash = arenaHash(arena, world, world.hash);
    writePhysicsParams(arena, world);
    world.wasm = arena;
    return true;
}
