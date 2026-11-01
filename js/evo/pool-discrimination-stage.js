// Stages a tiny hand-built world for the pooled-ray discrimination scenes: a few agents, food and rocks, nothing else.

import { createConfig } from '../sim/config.js';
import { ENERGY_SOURCE, addEnergy } from '../sim/energy.js';
import { BORN_CAUSE } from '../sim/events.js';
import { createWorld, spawnAgent, spawnFoodItem } from '../sim/spawn.js';

/** Where an unused rock is parked: far outside the world and out of every ray's reach. */
const PARKED = 20000;

/** Radius of a staged food item and the energy it holds. */
const FOOD_RADIUS = 50;
const FOOD_VALUE = 300;

/**
 * The knobs that keep a staged world to the scene: no regrowth, no hazards, no reproduction pressure, one wall gap and
 * no refuges; its rocks are rewritten by `stageWorld`.
 */
const STAGE_CONFIG = Object.freeze({
    worldWidth: 3000,
    worldHeight: 4000,
    maxAgents: 8,
    herdCount: 0,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    foodRegrowPerArea: 0,
    fertileZoneMax: 0,
    foodPatchCount: 0,
    refugeCount: 0,
    coldMarginWidth: 0,
    wallGaps: 1,
    alarmThreshold: 0,
    huntCallThreshold: 0,
    capBirthsEnabled: false,
    digestTicks: 0,
    handlingTicks: 0,
    satiationShare: 0,
    hebbianRate: 0,
    specMutationRate: 0,
    checkInvariants: false,
});

/**
 * @typedef {object} StagedAgent
 * @property {number} x centre x
 * @property {number} y centre y
 * @property {number} angle heading in radians
 * @property {number} spec the specialisation index (0 forager, 1 predator)
 * @property {number} energy starting energy, at least the config's `initialEnergy` (energy is only added)
 * @property {Float32Array} [weights] the brain row the agent is born with (default: all zero)
 * @property {[number, number]} [parents] the agent's `parentA` and `parentB` ids (default `[0, 0]`; a shared nonzero
 *   id makes two agents kin)
 */

/**
 * @typedef {object} Stage
 * @property {{x: number, y: number, hue?: number}[]} foods food centres and optional hue
 * @property {{x: number, y: number, r: number}[]} rocks rock centres and radii
 * @property {StagedAgent[]} agents agents by slot; slot 0 is the one the scene scores
 * @property {number} seed the world seed
 * @property {Record<string, any>} [config] config keys applied over the staging knobs (the probes restore the rules a
 *   genome's behaviour depends on)
 */

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {[number, number]} parents the ids to store as `parentA` and `parentB`
 * @returns {void}
 */
function setParents(world, slot, parents) {
    world.parentA[slot] = parents[0];
    world.parentB[slot] = parents[1];
}

/**
 * Builds the world: the agents in slot order, the food items and the rocks.
 * @param {Stage} stage what to place
 * @returns {Record<string, any>} the world
 * @throws {Error} when the world has too few rock slots for the stage
 */
export function stageWorld({ foods, rocks, agents, seed, config = {} }) {
    const policy = {
        initSpec: (/** @type {any} */ _w, /** @type {number} */ slot) => agents[slot].spec,
        initBrain(/** @type {any} */ w, /** @type {number} */ slot) {
            const { weights } = agents[slot];
            if (weights !== undefined) {
                w.weights.set(weights, slot * w.layout.weightCount);
            }
        },
    };
    const world = createWorld(createConfig({ ...STAGE_CONFIG, ...config, seed }), policy);
    if (rocks.length > world.obsX.length) {
        throw new Error(`stageWorld: ${rocks.length} rocks do not fit ${world.obsX.length} rock slots`);
    }
    for (let i = 0; i < world.obsX.length; i++) {
        const rock = rocks[i] ?? { x: PARKED, y: PARKED, r: 1 };
        world.obsX[i] = rock.x;
        world.obsY[i] = rock.y;
        world.obsRadius[i] = rock.r;
    }
    for (const food of foods) {
        const slot = spawnFoodItem(world);
        world.foodX[slot] = food.x;
        world.foodY[slot] = food.y;
        world.foodRadius[slot] = FOOD_RADIUS;
        world.foodValue[slot] = FOOD_VALUE;
        if (food.hue !== undefined) {
            world.foodHue[slot] = food.hue;
        }
    }
    for (const agent of agents) {
        const slot = spawnAgent(world, policy, BORN_CAUSE.INITIAL);
        addEnergy(world, slot, agent.energy - world.energy[slot], ENERGY_SOURCE.INITIAL);
        world.x[slot] = agent.x;
        world.y[slot] = agent.y;
        world.angle[slot] = agent.angle;
        setParents(world, slot, agent.parents ?? [0, 0]);
    }
    return { world, policy };
}
