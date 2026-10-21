// Hashes a world's state bytes at a checkpoint, in the fixed order of the design doc's hashWorld section.
import { fnv64Bytes, fnv64Hex, fnv64Init } from './fnv.js';

/** Agent arrays hashed whole, in the World state table order; `hidden` is handled separately. */
const AGENT_ARRAYS = [
    'alive',
    'spec',
    'x',
    'y',
    'vx',
    'vy',
    'angle',
    'turnRate',
    'size',
    'energy',
    'foodEnergy',
    'biteEnergy',
    'ageTicks',
    'cooldown',
    'pregnancy',
    'ateTimer',
    'bittenTimer',
    'lastLoss',
    'temperature',
    'genomeId',
    'lineageId',
    'parentA',
    'parentB',
    'lastBiter',
    'weights',
    'fatherWeights',
    'fatherId',
    'fatherLineage',
    'lastBiteTick',
    'prevBiter',
    'prevBiteTick',
    'alarmTimer',
    'huntTimer',
    'smokeTimer',
    'heard',
];

/** Arrays hashed after the agents: food, obstacles, fertile zones, pheromones, then the ledger. */
const FIELD_ARRAYS = [
    'foodAlive',
    'foodX',
    'foodY',
    'foodRadius',
    'foodValue',
    'foodAge',
    'obsX',
    'obsY',
    'obsVx',
    'obsVy',
    'obsRadius',
    'zoneAlive',
    'zoneX',
    'zoneY',
    'zoneFertility',
    'zoneInitial',
    'danger',
    'attack',
    'hunt',
    'cloudX',
    'cloudY',
    'cloudTtl',
    'ledger',
];

/** RNG streams hashed by their `s` state, in the design doc's Determinism table order. */
const RNG_STREAMS = ['obstacles', 'spawn', 'brain-init', 'mutation', 'food', 'lifecycle'];

/** Scalars hashed first, as one `Uint32Array(5)`: tick, nextId, population, foodCount, cloudCount. */
const scalars = new Uint32Array(5);
const scalarBytes = new Uint8Array(scalars.buffer, scalars.byteOffset, scalars.byteLength);
const digest = new Uint32Array(2);

/** Per-world cache of byte views, so a checkpoint allocates nothing after the first call. */
const viewCache = new WeakMap();

/**
 * @param {Record<string, any>} world the world
 * @param {string} name the array's property name
 * @returns {Uint8Array} the raw bytes of the array
 */
function bytesOf(world, name) {
    const arr = world[name];
    if (!ArrayBuffer.isView(arr)) {
        throw new Error(`hashWorld: world.${name} is missing or is not a typed array`);
    }
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Builds the byte views for the whole-array part of the hash, once per world.
 * @param {Record<string, any>} world the world
 * @returns {{ agents: Uint8Array[], hidden: Uint8Array, fastOut: Uint8Array, vision: Uint8Array, baseSize: Uint8Array, fields: Uint8Array[], rngSources: Uint32Array[], rngViews: Uint8Array[] }}
 */
function buildViews(world) {
    const { maxAgents } = world.config;
    const hiddenRows = world.hidden.subarray(0, maxAgents * world.layout.hidden);
    return {
        agents: AGENT_ARRAYS.map((name) => bytesOf(world, name)),
        fields: FIELD_ARRAYS.map((name) => bytesOf(world, name)),
        hidden: new Uint8Array(hiddenRows.buffer, hiddenRows.byteOffset, hiddenRows.byteLength),
        fastOut: bytesOf(world, 'fastOut'),
        vision: bytesOf(world, 'vision'),
        baseSize: bytesOf(world, 'baseSize'),
        rngSources: [],
        rngViews: [],
    };
}

/**
 * Returns the cached views, rebuilding the RNG part when a stream's `s` array has been replaced.
 * @param {Record<string, any>} world the world
 * @returns {ReturnType<typeof buildViews>}
 */
function viewsFor(world) {
    let views = viewCache.get(world);
    if (views === undefined) {
        views = buildViews(world);
        viewCache.set(world, views);
    }
    for (let i = 0; i < RNG_STREAMS.length; i++) {
        const s = rngState(world, RNG_STREAMS[i]);
        if (views.rngSources[i] !== s) {
            views.rngSources[i] = s;
            views.rngViews[i] = new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
        }
    }
    return views;
}

/**
 * @param {Record<string, any>} world the world
 * @param {string} name the stream name
 * @returns {Uint32Array} the stream's sfc32 state
 */
function rngState(world, name) {
    const stream = world.rng[name];
    if (stream === undefined || stream === null || !(stream.s instanceof Uint32Array)) {
        throw new Error(`hashWorld: world.rng.${name} is missing; expected the six named RNG streams`);
    }
    return stream.s;
}

/**
 * Hashes a world's checkpoint state: scalars, agent arrays (without `inputs`, `outputs` and the scratch hidden row),
 * food, obstacles, zones, pheromones, the ledger and the RNG streams.
 * @param {Record<string, any>} world the world; `world.rng` must hold the six named streams
 * @returns {string} 16 lowercase hex characters
 * @throws {Error} when `world.rng` is null or a stream is missing
 */
export function hashWorld(world) {
    if (world.rng === null || world.rng === undefined) {
        throw new Error('hashWorld needs the RNG streams: world.rng is null; call createWorld first');
    }
    const views = viewsFor(world);
    scalars[0] = world.tick;
    scalars[1] = world.nextId;
    scalars[2] = world.population;
    scalars[3] = world.foodCount;
    scalars[4] = world.cloudCount;
    fnv64Init(digest);
    fnv64Bytes(digest, scalarBytes);
    for (const bytes of views.agents) {
        fnv64Bytes(digest, bytes);
    }
    if (world.config.hebbianRate > 0) {
        fnv64Bytes(digest, views.fastOut);
    }
    if (world.config.traitsEnabled) {
        fnv64Bytes(digest, views.vision);
        fnv64Bytes(digest, views.baseSize);
    }
    fnv64Bytes(digest, views.hidden);
    for (const bytes of views.fields) {
        fnv64Bytes(digest, bytes);
    }
    for (const bytes of views.rngViews) {
        fnv64Bytes(digest, bytes);
    }
    return fnv64Hex(digest);
}
