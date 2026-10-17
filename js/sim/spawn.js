// Places obstacles, food and agents, and builds a populated world from a config, a seed and a brain policy.

import { detCos, detSin } from './det-math.js';
import { ENERGY_SOURCE, addEnergy } from './energy.js';
import { BORN_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { createRng, fork, nextFloat, nextInt } from './rng.js';
import { createSpatialHash } from './spatial-hash.js';
import { TIMER_CAP, allocAgent, allocateWorld } from './world.js';

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const SPEC_COUNT = 5;
const STREAMS = ['obstacles', 'spawn', 'brain-init', 'mutation', 'food', 'lifecycle'];
/** Energy source for each cause an agent can be spawned with by this module. */
/** @type {Map<number, number>} */
const SPAWN_SOURCE = new Map([
    [BORN_CAUSE.INITIAL, ENERGY_SOURCE.INITIAL],
    [BORN_CAUSE.FLOOR, ENERGY_SOURCE.FLOOR],
    [BORN_CAUSE.IMMIGRANT, ENERGY_SOURCE.IMMIGRANT],
]);

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./rng.js').Rng} Rng */

/**
 * @typedef {object} Policy
 * @property {(world: World, slot: number, rng: Rng) => number} [initSpec] returns the specialisation index
 * @property {(world: World, slot: number, rng: Rng) => void} initBrain writes the slot's `weights` row
 */

/**
 * @param {World} world the world
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} radius circle radius
 * @returns {boolean} whether the circle overlaps no obstacle
 */
function clearOfObstacles(world, x, y, radius) {
    const { obsX, obsY, obsRadius } = world;
    for (let i = 0; i < obsX.length; i++) {
        const reach = obsRadius[i] + radius;
        const dx = x - obsX[i];
        const dy = y - obsY[i];
        if (Math.sqrt(dx * dx + dy * dy) < reach) {
            return false;
        }
    }
    return true;
}

/**
 * @param {World} world the world
 * @param {number} radius the circle radius that failed to place
 * @returns {Error}
 */
function placementError(world, radius) {
    const { placementTries } = world.config;
    return new Error(
        `placement failed at tick ${world.tick}: no point clear of obstacles for radius ${radius} in ${placementTries} tries`,
    );
}

/**
 * Finds a point clear of every obstacle by rejection sampling and writes it to `world.point`.
 * @param {World} world the world
 * @param {Rng} rng the stream to draw from
 * @param {number} radius the circle radius to keep clear
 * @returns {void}
 * @throws {Error} after `placementTries` rejections
 */
export function placeClear(world, rng, radius) {
    const { worldWidth, worldHeight, placementTries } = world.config;
    for (let attempt = 0; attempt < placementTries; attempt++) {
        const x = radius + nextFloat(rng) * (worldWidth - 2 * radius);
        const y = radius + nextFloat(rng) * (worldHeight - 2 * radius);
        if (clearOfObstacles(world, x, y, radius)) {
            world.point[0] = x;
            world.point[1] = y;
            return;
        }
    }
    throw placementError(world, radius);
}

/**
 * Fills the obstacle arrays from the `obstacles` stream; obstacles may overlap each other.
 * @param {World} world the world
 * @returns {void}
 */
export function placeObstacles(world) {
    const { obstacleCount, obstacleMinRadius, obstacleMaxRadius, obstacleMaxSpeed } = world.config;
    const { worldWidth, worldHeight } = world.config;
    const rng = world.rng.obstacles;
    for (let i = 0; i < obstacleCount; i++) {
        const radius = obstacleMinRadius + nextFloat(rng) * (obstacleMaxRadius - obstacleMinRadius);
        world.obsRadius[i] = radius;
        world.obsX[i] = radius + nextFloat(rng) * (worldWidth - 2 * radius);
        world.obsY[i] = radius + nextFloat(rng) * (worldHeight - 2 * radius);
        const heading = nextFloat(rng) * TWO_PI;
        const speed = nextFloat(rng) * obstacleMaxSpeed;
        world.obsVx[i] = speed * detCos(heading);
        world.obsVy[i] = speed * detSin(heading);
    }
}

/**
 * @param {World} world the world
 * @returns {number} the summed fertility of the alive zones
 */
function totalFertility(world) {
    let total = 0;
    for (let i = 0; i < world.zoneAlive.length; i++) {
        if (world.zoneAlive[i] === 1) {
            total += world.zoneFertility[i];
        }
    }
    return total;
}

/**
 * Roulette over alive zones in ascending index; falls back to the last alive zone on rounding.
 * @param {World} world the world
 * @param {number} target a point in `[0, total fertility)`
 * @returns {number} the zone index
 */
function pickZone(world, target) {
    let remaining = target;
    let last = -1;
    for (let i = 0; i < world.zoneAlive.length; i++) {
        if (world.zoneAlive[i] === 1) {
            last = i;
            remaining -= world.zoneFertility[i];
            if (remaining < 0) {
                return i;
            }
        }
    }
    return last;
}

/**
 * Draws a point around a zone centre, redrawing while it lies in an obstacle, and writes it to `world.point`.
 * A zone an obstacle has drifted over leaves no clear point, so after `placementTries` it places uniformly instead.
 * @param {World} world the world
 * @param {number} zone the zone index
 * @param {number} radius the food radius
 * @returns {void}
 */
function placeInZone(world, zone, radius) {
    const { worldWidth, worldHeight, placementTries, fertileZoneRadius } = world.config;
    const rng = world.rng.food;
    for (let attempt = 0; attempt < placementTries; attempt++) {
        const r = fertileZoneRadius * Math.sqrt(nextFloat(rng));
        const theta = nextFloat(rng) * TWO_PI;
        const x = Math.min(worldWidth - radius, Math.max(radius, world.zoneX[zone] + r * detCos(theta)));
        const y = Math.min(worldHeight - radius, Math.max(radius, world.zoneY[zone] + r * detSin(theta)));
        if (clearOfObstacles(world, x, y, radius)) {
            world.point[0] = x;
            world.point[1] = y;
            return;
        }
    }
    placeClear(world, rng, radius);
}

/**
 * @param {World} world the world
 * @returns {number} the lowest free food slot
 */
function freeFoodSlot(world) {
    const { foodAlive } = world;
    for (let slot = 0; slot < foodAlive.length; slot++) {
        if (foodAlive[slot] === 0) {
            return slot;
        }
    }
    throw new Error(
        `spawnFoodItem: no free food slot at tick ${world.tick}; foodCount is at maxFood (${foodAlive.length})`,
    );
}

/**
 * Places a food item from the `food` stream into the lowest free slot.
 * @param {World} world the world
 * @returns {number} the food slot
 * @throws {Error} when `maxFood` items are alive
 */
export function spawnFoodItem(world) {
    const c = world.config;
    const slot = freeFoodSlot(world);
    const rng = world.rng.food;
    const high = nextFloat(rng) < c.highFoodChance;
    const radius = high ? c.highFoodRadius : c.foodRadius;
    const total = totalFertility(world);
    if (total > 0 && nextFloat(rng) < c.fertileZoneSpawnChance) {
        placeInZone(world, pickZone(world, nextFloat(rng) * total), radius);
    } else {
        placeClear(world, rng, radius);
    }
    const base = high ? c.highFoodEnergy : c.foodEnergy;
    const variance = high ? c.highFoodEnergyVariance : c.foodEnergyVariance;
    world.foodAlive[slot] = 1;
    world.foodX[slot] = world.point[0];
    world.foodY[slot] = world.point[1];
    world.foodRadius[slot] = radius;
    world.foodValue[slot] = base + (2 * nextFloat(rng) - 1) * variance;
    world.foodAge[slot] = 0;
    world.foodCount += 1;
    return slot;
}

/**
 * Spawns a fresh-lineage agent from the `spawn` and `brain-init` streams and pushes `AgentBorn`.
 * @param {World} world the world
 * @param {Policy} policy the brain policy
 * @param {number} cause a `BORN_CAUSE` of `INITIAL`, `FLOOR` or `IMMIGRANT`
 * @returns {number} the agent slot
 * @throws {Error} when the cause is not a spawn cause or the world is full
 */
export function spawnAgent(world, policy, cause) {
    const source = SPAWN_SOURCE.get(cause);
    if (source === undefined) {
        throw new Error(`spawnAgent: cause must be initial, floor or immigrant, got ${cause}`);
    }
    const c = world.config;
    const slot = allocAgent(world);
    const id = world.nextId++;
    world.genomeId[slot] = id;
    world.lineageId[slot] = id;
    world.spec[slot] = policy.initSpec
        ? policy.initSpec(world, slot, world.rng.spawn)
        : nextInt(world.rng.spawn, SPEC_COUNT);
    policy.initBrain(world, slot, world.rng['brain-init']);
    placeClear(world, world.rng.spawn, Math.max(c.minSize, c.baseSize + c.initialEnergy / c.energyToSize));
    world.x[slot] = world.point[0];
    world.y[slot] = world.point[1];
    world.angle[slot] = nextFloat(world.rng.spawn) * TWO_PI - PI;
    world.ateTimer[slot] = TIMER_CAP;
    world.bittenTimer[slot] = TIMER_CAP;
    world.temperature[slot] = c.temperatureStart;
    addEnergy(world, slot, c.initialEnergy, source);
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_BORN, world.tick);
    const d = world.events.data;
    d[o + 2] = slot;
    d[o + 3] = id;
    d[o + 4] = id;
    d[o + 5] = world.spec[slot];
    d[o + 8] = cause;
    return slot;
}

/**
 * Builds a world: allocates it, forks the streams, then places obstacles, food and the initial agents.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Policy} policy the brain policy
 * @returns {World}
 */
export function createWorld(config, policy) {
    const world = allocateWorld(config);
    const root = createRng(config.seed);
    world.rng = Object.fromEntries(STREAMS.map((name) => [name, fork(root, name)]));
    world.hash = createSpatialHash(config);
    placeObstacles(world);
    for (let i = 0; i < config.initialFood; i++) {
        spawnFoodItem(world);
    }
    for (let i = 0; i < config.initialAgents; i++) {
        spawnAgent(world, policy, BORN_CAUSE.INITIAL);
    }
    return world;
}
