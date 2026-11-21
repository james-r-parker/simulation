// The empty arena of the chase envelope (docs/designs/senses-and-motor.md, Phase 2): a world with no food, herds,
// refuges or floor, big enough that no chase of `MAX_TICKS` reaches a wall, holding scripted bodies that the audit
// places and drives by hand. Every rule is the config's, so the audit reads the defaults it is given.

import { ENERGY_SOURCE, addEnergy, updateSize } from '../sim/energy.js';
import { BORN_CAUSE } from '../sim/events.js';
import { createConfig } from '../sim/config.js';
import { createWorld, spawnAgent, spawnFoodItem } from '../sim/spawn.js';

/** The wall of rocks stands at the middle of the arena's width (x = 8000); the bodies start well clear of it. */
export const ARENA_WIDTH = 16000;
export const ARENA_HEIGHT = 8000;
/** Where the first body stands: 4000 from the wall and from the edges, so a chase of `MAX_TICKS` ends in the open. */
export const ARENA_CENTRE = Object.freeze({ x: 4000, y: 4000 });

/** Where an unused rock is parked: far outside the world and out of every ray's reach. */
const PARKED = 20000;

/** Radius of a staged food item and the energy it holds. */
const FOOD_RADIUS = 50;
const FOOD_VALUE = 300;

/** The knobs that empty a world; a caller's overrides win over them. */
const EMPTY = Object.freeze({
    worldWidth: ARENA_WIDTH,
    worldHeight: ARENA_HEIGHT,
    maxAgents: 8,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    foodSpawnRate: 0,
    fertileZoneMax: 0,
    refugeCount: 0,
    herdCount: 0,
    coldMarginWidth: 0,
    checkInvariants: false,
});

/**
 * @typedef {object} Body one scripted body
 * @property {number} spec its specialisation index
 * @property {number} x centre x
 * @property {number} y centre y
 * @property {number} angle its heading
 * @property {number} [energyShare] its energy as a share of its specialisation's store (0.5)
 * @property {number} [energy] its starting energy, at least the config's `initialEnergy` (energy is only added); wins
 *   over `energyShare`
 * @property {number} [baseSize] its base size (default: the config's `baseSize`); size is this plus energy / `energyToSize`
 * @property {Float32Array} [weights] the brain row it is born with (default: all zero)
 * @property {[number, number]} [parents] its `parentA` and `parentB` ids (default `[0, 0]`; a shared nonzero id makes two
 *   agents kin)
 */

/**
 * @typedef {object} Props what an arena holds besides its bodies
 * @property {{x: number, y: number, hue?: number, toxicity?: number}[]} [foods] food centres, optional hue and optional
 *   toxicity in [0, 1] (default 0)
 * @property {{x: number, y: number, r: number}[] | null} [rocks] rock centres and radii, rewriting every rock slot (an
 *   unused one is parked out of reach); `null` keeps the config's rocks (the chase arena's wall)
 * @property {boolean} [atRest] whether each body starts with no velocity (true)
 */

/**
 * @param {Record<string, any>} [overrides] config overrides over the empty arena
 * @returns {Readonly<Record<string, any>>} the arena's config
 */
export function arenaConfig(overrides = {}) {
    return createConfig({ ...EMPTY, ...overrides });
}

/**
 * @param {Record<string, any>} world the world
 * @param {{x: number, y: number, r: number}[]} rocks the rocks, rewriting every rock slot
 * @returns {void}
 * @throws {Error} when the world has too few rock slots
 */
function placeRocks(world, rocks) {
    if (rocks.length > world.obsX.length) {
        throw new Error(`stageWorld: ${rocks.length} rocks do not fit ${world.obsX.length} rock slots`);
    }
    for (let i = 0; i < world.obsX.length; i++) {
        const rock = rocks[i] ?? { x: PARKED, y: PARKED, r: 1 };
        world.obsX[i] = rock.x;
        world.obsY[i] = rock.y;
        world.obsRadius[i] = rock.r;
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {NonNullable<Props['foods']>} foods the foods to place
 * @returns {void}
 */
function placeFoods(world, foods) {
    for (const food of foods) {
        const slot = spawnFoodItem(world);
        world.foodX[slot] = food.x;
        world.foodY[slot] = food.y;
        world.foodRadius[slot] = FOOD_RADIUS;
        world.foodValue[slot] = FOOD_VALUE;
        if (food.hue !== undefined) {
            world.foodHue[slot] = food.hue;
        }
        if (food.toxicity !== undefined) {
            world.foodTox[slot] = food.toxicity;
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the freshly spawned agent
 * @param {Body} body where and how to stage it
 * @param {boolean} atRest whether to stop it
 * @returns {void}
 */
function placeBody(world, slot, body, atRest) {
    const target = body.energy ?? (body.energyShare ?? 0.5) * world.maxEnergyBySpec[body.spec];
    addEnergy(world, slot, target - world.energy[slot], ENERGY_SOURCE.INITIAL);
    world.x[slot] = body.x;
    world.y[slot] = body.y;
    world.angle[slot] = body.angle;
    if (atRest) {
        world.vx[slot] = 0;
        world.vy[slot] = 0;
    }
    if (body.baseSize !== undefined) {
        world.lanes.baseSize[slot] = body.baseSize;
        updateSize(world, slot);
    }
    world.parentA[slot] = body.parents?.[0] ?? 0;
    world.parentB[slot] = body.parents?.[1] ?? 0;
}

/**
 * Builds a world of scripted bodies, the one stager of the chase arenas, the drills, the reflex cases and the role
 * scenes: the rocks, then the foods, then the bodies in slot order.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`, or any config the staged scene needs
 * @param {readonly Body[]} bodies the bodies to place
 * @param {Props} [props] foods, rocks and whether the bodies start at rest
 * @returns {{world: Record<string, any>, policy: import('../sim/spawn.js').Policy}} the world and the policy to step it with
 */
export function stageArena(config, bodies, { foods = [], rocks = null, atRest = true } = {}) {
    const policy = {
        initSpec: (/** @type {any} */ _w, /** @type {number} */ slot) => bodies[slot].spec,
        initBrain(/** @type {any} */ w, /** @type {number} */ slot) {
            const { weights } = bodies[slot];
            if (weights !== undefined) {
                w.weights.set(weights, slot * w.layout.weightCount);
            }
        },
    };
    const world = createWorld(config, policy);
    if (rocks !== null) {
        placeRocks(world, rocks);
    }
    placeFoods(world, foods);
    for (const body of bodies) {
        placeBody(world, spawnAgent(world, policy, BORN_CAUSE.INITIAL), body, atRest);
    }
    return { world, policy };
}
