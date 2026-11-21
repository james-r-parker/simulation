// Allocates the world's typed arrays once and manages agent and food slots.

import { BODY_SENSE_LANES } from './body-sense.js';
import { agentSpecs } from './agent-arrays.js';
import { allocateFlora } from './flora-state.js';
import { releaseItem } from './patch-reserve.js';
import { birthRingSpec } from './birth-budget.js';
import { OUTPUT_COUNT, brainLayout } from './brain-layout.js';
import { createInputActivity } from './input-activity.js';
import { createEventRing } from './events.js';
import { detCos, detSin } from './det-math.js';
import { allocDiseaseState, diseaseSpecs } from './disease-state.js';
import { allocCoverState } from './cover.js';
import { killSpecs } from './kills.js';
import { allocCarcassLoss } from './carcass.js';
import { allocLedgerState, ledgerSpecs } from './hunter-ledger.js';
import { mateRankSpecs } from './mate-rank.js';
import { rewardSpecs } from './reward.js';
import { proofSpecs } from './proof.js';
import { splitGateSpecs } from './split-gate.js';
import { MERIT_TALLY_SIZE, createMeritViews, meritSpecs, resetMeritSlot } from './merit-state.js';
import { LOCAL_STRIDE } from './ray-gather.js';
import { rayTables } from './ray-pool.js';
import { rayReachTable } from './ray-reach.js';
import { terrainRockCount } from './terrain.js';
import { createObserverScratch } from './observer-scratch.js';
import { attachWasm } from './wasm-arena.js';
import { allocLanes } from './lane-state.js';
import { allocEffects } from './effects.js';
import { allocSprintState, resetSprintSlot } from './sprint-store.js';
import { specTable } from './spec-params.js';

/** Cap, in ticks, on `ateTimer` and `bittenTimer`. */
export const TIMER_CAP = 30;

/** Elements of the per-world ray-march scratch row. */
export const RAY_SCRATCH = 10;

/** Floats per slot in `world.heard` (`agent-arrays.js`). */
export { HEARD_STRIDE } from './agent-arrays.js';

/**
 * Elements of the per-world call scratch row: the calling slot, the `heard` offset, the call's strength and the
 * largest `hearing` lane of the pass (how far beyond the caller's radius a call may be heard).
 */
export const CALL_SCRATCH = 5;

const BYTE_PAIR = 0x0102;

/**
 * @typedef {object} Rows
 * @property {Float64Array | Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array} array the backing array
 * @property {number} stride elements per slot
 * @property {string} [name] the world field the array is
 */

/** @typedef {Record<string, any>} World the allocated world; see the design doc's World state section */

/** @typedef {[any, string, number, Record<string, any>?]} Spec constructor, name, elements per slot, and optionally what the array is (`agent-arrays.js`) */

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
        return { array, stride, name };
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
 * @param {World} world the world being built
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {void}
 */
function allocAgentArrays(world, layout) {
    const n = world.config.maxAgents;
    world.agentRows = allocRows(
        world,
        [
            ...agentSpecs(layout),
            birthRingSpec(world.config.maxBirthsPerWindow),
            ...meritSpecs(),
            ...splitGateSpecs(),
            ...proofSpecs(),
            ...killSpecs(),
            // `carcassHeld`: what a kill left for the carcass (js/sim/kill-body.js)
            [Float64Array, 'carcassHeld', 1],
            ...ledgerSpecs(),
            ...diseaseSpecs(),
            ...mateRankSpecs(),
            ...rewardSpecs(),
            ...(world.config.predatorRestTicks > 0 ? singles(Uint16Array, ['restTimer']) : []),
        ],
        n,
    );
    createMeritViews(world);
    allocSprintState(world);
    allocLanes(world);
    allocEffects(world);
    allocLedgerState(world);
    allocCarcassLoss(world);
    allocDiseaseState(world);
    world.inputActivity = createInputActivity(layout);
    allocRows(world, [[Float32Array, 'hidden', layout.hidden]], n + 1);
    // The last hidden row is the scratch row, which is not an agent row.
    world.agentRows.push({ array: world.hidden.subarray(0, n * layout.hidden), stride: layout.hidden, name: 'hidden' });
}

/**
 * @param {World} world the world being built
 * @returns {void}
 */
function allocFoodAndObstacles(world) {
    const { maxFood } = world.config;
    const obstacleCount = terrainRockCount(world.config);
    world.foodRows = allocRows(
        world,
        [
            ...singles(Uint8Array, ['foodAlive', 'foodKind', 'foodOrigin', 'foodGone']),
            ...singles(Float32Array, ['foodX', 'foodY', 'foodRadius']),
            ...singles(Float64Array, ['foodValue', 'foodTaken']),
            ...singles(Uint32Array, ['foodAge']),
        ],
        maxFood,
    );
    allocRows(world, singles(Float32Array, ['obsX', 'obsY', 'obsRadius']), obstacleCount);
    allocCoverState(world);
}

/**
 * Allocates the persistent herd and group state; centroids, counts and observer totals are derived scratch.
 * @param {World} world the world being built
 * @returns {void}
 */
function allocHerdState(world) {
    const { herdCount, herdSize } = world.config;
    const herdMax = herdCount * herdSize;
    world.herdMax = herdMax;
    world.herdNextId = 1;
    world.herdTotals = new Float64Array(2);
    const specCount = Object.keys(world.config.specialisations).length;
    world.foodEatenBySpec = new Float64Array(specCount);
    world.dungFoodIntake = 0;
    world.herdCarcassEatenBySpec = new Float64Array(specCount);
    world.herdDesired = new Float32Array(4);
    allocRows(world, singles(Uint8Array, ['herdAlive', 'herdGroup']), herdMax);
    allocRows(world, singles(Float32Array, ['herdX', 'herdY', 'herdVx', 'herdVy']), herdMax);
    allocRows(
        world,
        singles(Uint32Array, [
            'herdAge',
            'herdLife',
            'herdGraze',
            'herdId',
            'herdSeedPatch',
            'herdSeedSerial',
            'herdSeedTicks',
        ]),
        herdMax,
    );
    allocRows(world, singles(Float64Array, ['herdStore']), herdMax);
    allocRows(world, singles(Uint32Array, ['groupAlarm', 'groupStay', 'groupBirthTimer']), herdCount);
    allocRows(world, singles(Float32Array, ['groupFleeX', 'groupFleeY']), herdCount);
    allocRows(world, singles(Float64Array, ['groupPatchWeight', 'groupCentroidX', 'groupCentroidY']), herdCount);
    allocRows(world, singles(Int32Array, ['groupPatch']), herdCount);
    world.groupAnimalCount = new Uint16Array(herdCount);
    world.groupPatch.fill(-1);
}

/**
 * @param {World} world the world being built
 * @returns {void}
 */
function allocZonesAndPheromones(world) {
    const { fertileZoneMax, worldWidth, worldHeight, pheromoneCellSize } = world.config;
    allocRows(world, singles(Uint8Array, ['zoneAlive', 'zoneOrigin']), fertileZoneMax);
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
 * @param {World} world the world being built
 * @returns {void}
 */
function allocPatches(world) {
    const { floraPatchMax } = world.config;
    allocRows(world, singles(Float32Array, ['patchX', 'patchY']), floraPatchMax);
    allocRows(world, singles(Float64Array, ['patchStock', 'patchReserved']), floraPatchMax);
    allocateFlora(world);
}

/**
 * @param {number} n `maxAgents`
 * @returns {Record<string, any>} the per-pass scratch that is not an agent row: the birth cap's slots and keys, the mate
 *   scores of `refreshMateRanks`, and the kill log (`kills.js`) with its count
 */
function agentScratch(n) {
    return {
        capSlots: new Int32Array(n),
        capKeys: new Float64Array(n),
        mateScores: new Float64Array(n),
        killLog: new Float64Array(n),
        killCount: 0,
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Float64Array} `splitMinEnergy` times each specialisation's `splitMinEnergyMultiplier`, indexed by `index`
 */
function splitMinTable(config) {
    const table = specTable(config, 'splitMinEnergyMultiplier');
    for (let k = 0; k < table.length; k++) {
        table[k] *= config.splitMinEnergy;
    }
    return table;
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Float64Array} `maxEnergy` times each specialisation's `maxEnergyMultiplier`, indexed by `index`: the energy
 *   store of an agent of that specialisation at its base, the normaliser the detectors read (the sim reads each agent's
 *   `maxEnergy` lane)
 */
function maxEnergyTable(config) {
    const table = specTable(config, 'maxEnergyMultiplier');
    for (let k = 0; k < table.length; k++) {
        table[k] *= config.maxEnergy;
    }
    return table;
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Record<string, Float64Array>} the per-specialisation lookup tables, each indexed by `index`
 */
function specTables(config) {
    return {
        visionBySpec: specTable(config, 'visionRange'),
        biteBySpec: specTable(config, 'biteMultiplier'),
        huntBySpec: specTable(config, 'canHunt'),
        splitMinBySpec: splitMinTable(config),
        maxEnergyBySpec: maxEnergyTable(config),
        plantFoodBySpec: specTable(config, 'plantFoodValue'),
        meatFoodBySpec: specTable(config, 'meatFoodValue'),
        turnBySpec: specTable(config, 'turnMultiplier'),
        sprintBySpec: specTable(config, 'sprintBoost'),
    };
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
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {{rayHue: Float32Array, raySize: Float32Array, raySpeed: Float32Array, rayClosing: Float32Array,
 *   bodySenseScratch: Float64Array}} the per-ray lanes the ray march writes and pooling reads, `rayCount` per slot: the
 *   hue of a food hit, and the size, speed and closing of an agent hit (docs/designs/body-genes.md, "Raw lanes"); and
 *   the scratch `bodySenseOf` writes them through
 */
function rayLanes(config) {
    const n = config.maxAgents * config.rayCount;
    return {
        rayHue: new Float32Array(n),
        raySize: new Float32Array(n),
        raySpeed: new Float32Array(n),
        rayClosing: new Float32Array(n),
        bodySenseScratch: new Float64Array(BODY_SENSE_LANES),
    };
}

/**
 * Allocates world arrays; `rng` is filled in later by `createWorld`.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {World}
 */
export function allocateWorld(config) {
    assertLittleEndian();
    const world = /** @type {World} */ ({
        config,
        layout: brainLayout(config),
        rng: null,
        tick: 0,
        nextId: 1,
        population: 0,
        foodCount: 0,
        ...createObserverScratch(config),
        transferGained: 0,
        contactCount: 0,
        season: new Float64Array(2),
        era: new Int32Array([-1]),
        birthOptions: { cause: 0, rng: null },
        ...agentScratch(config.maxAgents),
        meritTally: new Float64Array(MERIT_TALLY_SIZE),
        ...rayTables(config.rayCount),
        ...specTables(config),
        ...rayReachTable(config),
        biteCos: new Float64Array([detCos(config.biteArc)]),
        antennaCos: new Float64Array([detCos(config.antennaAngle)]),
        antennaSin: new Float64Array([detSin(config.antennaAngle)]),
        cloudCount: 0,
        ...rayLanes(config),
        rayScratch: new Float64Array(RAY_SCRATCH),
        rayStamp: new Int32Array(config.maxAgents + config.maxFood),
        rayLocal: new Float64Array(
            LOCAL_STRIDE *
                (config.maxAgents +
                    config.maxFood +
                    terrainRockCount(config) +
                    config.maxClouds +
                    config.herdCount * config.herdSize),
        ),
        callScratch: new Float64Array(CALL_SCRATCH),
        brainScratch: new Float64Array(Math.max(config.brainHidden, OUTPUT_COUNT)),
    });
    allocAgentArrays(world, world.layout);
    allocFoodAndObstacles(world);
    allocZonesAndPheromones(world);
    allocClouds(world);
    allocPatches(world);
    allocHerdState(world);
    world.events = createEventRing(config.eventCapacity);
    // Every world runs the brain in the WASM kernels from birth (docs/designs/wasm-kernels.md), before anything can
    // hash or copy its arrays; the arena takes over the hot arrays here.
    attachWasm(world);
    return { ...world };
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
            world.recoilEnergyLife[slot] = 0;
            world.biteSkipParent[slot] = 0;
            world.thrustSkipParent[slot] = 0;
            resetMeritSlot(world, slot);
            if (world.sprintStore !== undefined) {
                resetSprintSlot(world.sprintStore, world.sprintFactor, slot);
            }
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

/** Why a food slot was last emptied (`foodGone`); the observer reads it, the step never does. */
export const FOOD_GONE = Object.freeze({ NONE: 0, EATEN: 1, ROTTED: 2 });

/**
 * Zeroes every food array at a slot, then notes why it was emptied (`foodGone`) and the energy the eater stored
 * (`foodTaken`). Both are read only by the observer and are not hashed.
 * @param {World} world the world
 * @param {number} slot the alive food slot to remove
 * @param {number} [gone] a `FOOD_GONE` cause
 * @param {number} [taken] the energy the eater actually stored, for an eaten item
 * @returns {void}
 */
export function removeFood(world, slot, gone = FOOD_GONE.ROTTED, taken = 0) {
    if (world.foodAlive[slot] !== 1) {
        throw new Error(`removeFood: food slot ${slot} is not alive`);
    }
    releaseItem(world, slot);
    zeroSlot(world.foodRows, slot);
    world.foodGone[slot] = gone;
    world.foodTaken[slot] = taken;
    world.foodCount -= 1;
}
