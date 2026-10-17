// Allocates the world's typed arrays once and manages agent and food slots.

import { brainLayout } from './brain-layout.js';
import { createEventRing } from './events.js';
import { detCos, detSin } from './det-math.js';

/** Cap, in ticks, on `ateTimer` and `bittenTimer`. */
export const TIMER_CAP = 30;

/** Elements of the per-world ray-march scratch row. */
export const RAY_SCRATCH = 19;

/** Floats per slot in `world.heard`: alarm loudness, `ux`, `uy`, hunt loudness, `ux`, `uy`. */
export const HEARD_STRIDE = 6;

/** Elements of the per-world call scratch row: the calling slot, the `heard` offset and the call's strength. */
export const CALL_SCRATCH = 3;

const PI = 3.141592653589793;
const BYTE_PAIR = 0x0102;

/**
 * @typedef {object} Rows
 * @property {Float64Array | Float32Array | Uint32Array | Uint8Array} array the backing array
 * @property {number} stride elements per slot
 */

/** @typedef {Record<string, any>} World the allocated world; see the design doc's World state section */

/** @typedef {[any, string, number]} Spec constructor, name and elements per slot */

/**
 * Throws unless the platform stores multi-byte numbers little-endian.
 * @returns {void}
 */
function assertLittleEndian() {
    const bytes = new Uint8Array(new Uint16Array([BYTE_PAIR]).buffer);
    if (bytes[0] !== BYTE_PAIR % 256) {
        throw new Error('allocateWorld requires a little-endian platform; this one is big-endian');
    }
}

/**
 * Allocates one array per spec, stores it on the world and returns the per-slot row list.
 * @param {World} world the world being built
 * @param {Spec[]} specs the arrays to allocate
 * @param {number} slots number of slots
 * @returns {Rows[]}
 */
function allocRows(world, specs, slots) {
    return specs.map(([Type, name, stride]) => {
        const array = new Type(slots * stride);
        world[name] = array;
        return { array, stride };
    });
}

/**
 * @param {any} Type the typed array constructor
 * @param {string[]} names array names, one element per slot
 * @returns {Spec[]}
 */
function singles(Type, names) {
    return names.map((name) => [Type, name, 1]);
}

/**
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {Spec[]} the per-agent arrays other than `hidden`
 */
function agentSpecs(layout) {
    return [
        ...singles(Uint8Array, ['alive', 'spec', 'ateTimer', 'bittenTimer', 'lastLoss']),
        ...singles(Float32Array, ['x', 'y', 'vx', 'vy', 'angle', 'turnRate', 'size', 'temperature']),
        ...singles(Float64Array, ['energy', 'foodEnergy', 'biteEnergy']),
        ...singles(Uint32Array, ['ageTicks', 'cooldown', 'pregnancy']),
        ...singles(Uint32Array, ['genomeId', 'lineageId', 'parentA', 'parentB', 'lastBiter']),
        ...singles(Uint32Array, ['fatherId', 'fatherLineage']),
        ...singles(Uint32Array, ['lastBiteTick', 'prevBiter', 'prevBiteTick']),
        ...singles(Uint16Array, ['alarmTimer', 'huntTimer', 'smokeTimer']),
        [Float32Array, 'heard', HEARD_STRIDE],
        [Float32Array, 'inputs', layout.inputCount],
        [Float32Array, 'outputs', layout.outputCount],
        [Float32Array, 'leakRate', layout.hidden],
        [Float32Array, 'fastOut', layout.hidden * layout.outputCount],
        [Float32Array, 'weights', layout.weightCount],
        [Float32Array, 'fatherWeights', layout.weightCount],
    ];
}

/**
 * @param {World} world the world being built
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {void}
 */
function allocAgentArrays(world, layout) {
    const n = world.config.maxAgents;
    world.agentRows = allocRows(world, agentSpecs(layout), n);
    allocRows(world, [[Float32Array, 'hidden', layout.hidden]], n + 1);
    // The last hidden row is the scratch row, which is not an agent row.
    world.agentRows.push({ array: world.hidden.subarray(0, n * layout.hidden), stride: layout.hidden });
}

/**
 * @param {World} world the world being built
 * @returns {void}
 */
function allocFoodAndObstacles(world) {
    const { maxFood, obstacleCount } = world.config;
    world.foodRows = allocRows(
        world,
        [
            ...singles(Uint8Array, ['foodAlive']),
            ...singles(Float32Array, ['foodX', 'foodY', 'foodRadius']),
            ...singles(Float64Array, ['foodValue']),
            ...singles(Uint32Array, ['foodAge']),
        ],
        maxFood,
    );
    allocRows(world, singles(Float32Array, ['obsX', 'obsY', 'obsVx', 'obsVy', 'obsRadius']), obstacleCount);
}

/**
 * @param {World} world the world being built
 * @returns {void}
 */
function allocZonesAndPheromones(world) {
    const { fertileZoneMax, worldWidth, worldHeight, pheromoneCellSize } = world.config;
    allocRows(world, singles(Uint8Array, ['zoneAlive']), fertileZoneMax);
    allocRows(world, singles(Float32Array, ['zoneX', 'zoneY']), fertileZoneMax);
    allocRows(world, singles(Float64Array, ['zoneFertility', 'zoneInitial']), fertileZoneMax);
    world.pheromoneGrid = Object.freeze({
        cols: Math.ceil(worldWidth / pheromoneCellSize),
        rows: Math.ceil(worldHeight / pheromoneCellSize),
    });
    const cells = world.pheromoneGrid.cols * world.pheromoneGrid.rows;
    allocRows(world, singles(Float32Array, ['danger', 'attack', 'hunt', 'pheromoneScratch']), cells);
}

/**
 * @param {number} rayCount number of rays
 * @returns {{rayCos: Float64Array, raySin: Float64Array}} unit direction of each ray relative to the heading
 */
function rayTables(rayCount) {
    const rayCos = new Float64Array(rayCount);
    const raySin = new Float64Array(rayCount);
    for (let k = 0; k < rayCount; k++) {
        const theta = (2 * PI * k) / rayCount;
        rayCos[k] = detCos(theta);
        raySin[k] = detSin(theta);
    }
    return { rayCos, raySin };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} field a numeric field of each specialisation entry
 * @returns {Float64Array} that field of each specialisation, indexed by its `index`
 */
function specTable(config, field) {
    const specs = Object.values(config.specialisations);
    const table = new Float64Array(Math.max(...specs.map((s) => s.index)) + 1);
    for (const s of specs) {
        table[s.index] = s[field];
    }
    return table;
}

/**
 * @param {World} world the world being built
 * @returns {void}
 */
function allocClouds(world) {
    const { maxClouds } = world.config;
    allocRows(world, singles(Float32Array, ['cloudX', 'cloudY']), maxClouds);
    allocRows(world, singles(Uint16Array, ['cloudTtl']), maxClouds);
}

/**
 * Allocates every world array once; `rng` is filled in later by `createWorld`.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {World}
 */
export function allocateWorld(config) {
    assertLittleEndian();
    const layout = brainLayout(config);
    /** @type {World} */
    const world = {
        config,
        layout,
        rng: null,
        tick: 0,
        nextId: 1,
        population: 0,
        foodCount: 0,
        ledger: new Float64Array(2),
        point: new Float64Array(2),
        transferGained: 0,
        contacts: new Int32Array(2 * config.maxContacts),
        contactCount: 0,
        season: new Float64Array(2),
        birthOptions: { cause: 0, rng: null },
        ...rayTables(config.rayCount),
        visionBySpec: specTable(config, 'visionRange'),
        biteBySpec: specTable(config, 'biteMultiplier'),
        plantFoodBySpec: specTable(config, 'plantFoodValue'),
        turnBySpec: specTable(config, 'turnMultiplier'),
        sprintBySpec: specTable(config, 'sprintBoost'),
        biteCos: new Float64Array([detCos(config.biteArc)]),
        antennaCos: new Float64Array([detCos(config.antennaAngle)]),
        antennaSin: new Float64Array([detSin(config.antennaAngle)]),
        cloudCount: 0,
        rayScratch: new Float64Array(RAY_SCRATCH),
        nearObstacles: new Int32Array(config.obstacleCount),
        callScratch: new Float64Array(CALL_SCRATCH),
        brainScratch: new Float64Array(config.brainHidden),
    };
    allocAgentArrays(world, layout);
    allocFoodAndObstacles(world);
    allocZonesAndPheromones(world);
    allocClouds(world);
    world.events = createEventRing(config.eventCapacity);
    return world;
}

/**
 * Takes the lowest free agent slot and marks it alive.
 * @param {World} world the world
 * @returns {number} the slot
 */
export function allocAgent(world) {
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 0) {
            alive[slot] = 1;
            world.population += 1;
            return slot;
        }
    }
    throw new Error(`allocAgent: no free slot; population is at maxAgents (${alive.length})`);
}

/**
 * @param {Rows[]} rows the row arrays
 * @param {number} slot the slot to zero
 * @returns {void}
 */
function zeroSlot(rows, slot) {
    for (const { array, stride } of rows) {
        array.fill(0, slot * stride, (slot + 1) * stride);
    }
}

/**
 * Zeroes every per-agent row at a slot and marks it free.
 * @param {World} world the world
 * @param {number} slot the alive slot to free
 * @returns {void}
 */
export function freeAgent(world, slot) {
    if (world.alive[slot] !== 1) {
        throw new Error(`freeAgent: slot ${slot} is not alive`);
    }
    zeroSlot(world.agentRows, slot);
    world.population -= 1;
}

/**
 * Zeroes every food array at a slot.
 * @param {World} world the world
 * @param {number} slot the alive food slot to remove
 * @returns {void}
 */
export function removeFood(world, slot) {
    if (world.foodAlive[slot] !== 1) {
        throw new Error(`removeFood: food slot ${slot} is not alive`);
    }
    zeroSlot(world.foodRows, slot);
    world.foodCount -= 1;
}
