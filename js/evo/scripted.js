// Hand-written controllers for the anti-exploit suite: each replaces the `brain` phase and writes `world.outputs`
// for every alive agent from its ray inputs, so a fitness function can be scored against a known behaviour.

import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../sim/brain-layout.js';
import { nextFloat } from '../sim/rng.js';
import { nearestClassRay } from './observer-tick.js';

// Class flag channels within a ray (see js/sim/ray-march.js).
const CH_FOOD = 1;
const CH_BIGGER = 2;
const CH_FIRST_AGENT = 2;
const CH_LAST_AGENT = 5;
const CH_WALL = 6;

/**
 * Food energy after which `explorerAfterMeal` stops seeking food: two average food items. A foodSeeker in the
 * micro-world eats about 500 in its whole life, so a larger meal would never be finished.
 */
export const MEAL_ENERGY = 140;

/**
 * Thrust while seeking food: the speed at which a scripted forager population grows on the default economy; full thrust
 * burns more than it finds (sim-notes.md, 2026-10-16).
 */
export const SEEK_THRUST = 0.4;

/** `wanderer`'s slow random turn: the per-tick step and the bound, as fractions of `maxTurn`. */
const WANDER_STEP = 0.1;
const WANDER_BOUND = 0.3;

/** A wall hit nearer than this proximity (1 is touching) makes `explorerAfterMeal` turn. */
const WALL_NEAR = 0.6;

/**
 * @typedef {object} ControllerContext
 * @property {Record<string, any>} world the world the controller runs on
 * @property {import('../sim/rng.js').Rng} rng the `scripted` stream; the only source of randomness
 */

/** @typedef {(world: Record<string, any>) => void} ControllerRun */
/** @typedef {(context: ControllerContext) => ControllerRun} ControllerFactory */

/**
 * The turn output towards ray `k`: +1 for the positive side, -1 for the negative side, 0 dead ahead and +1 for a ray
 * dead behind.
 * @param {number} k ray index
 * @param {number} rayCount rays per agent
 * @returns {number}
 */
function turnTowards(k, rayCount) {
    if (k <= 0) {
        return 0;
    }
    return 2 * k <= rayCount ? 1 : -1;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} thrust thrust output
 * @param {number} turn turn output
 * @returns {void}
 */
function write(world, slot, thrust, turn) {
    const o = slot * OUTPUT_COUNT;
    world.outputs.fill(0, o, o + OUTPUT_COUNT);
    world.outputs[o + OUTPUT_INDEX.THRUST] = thrust;
    world.outputs[o + OUTPUT_INDEX.TURN] = turn;
}

/**
 * @param {(world: Record<string, any>, slot: number) => void} perAgent writes one alive agent's outputs
 * @returns {ControllerRun}
 */
function eachAlive(perAgent) {
    return (world) => {
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1) {
                perAgent(world, slot);
            }
        }
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function seekFood(world, slot) {
    const k = nearestClassRay(world, slot, CH_FOOD, CH_FOOD);
    write(world, slot, SEEK_THRUST, turnTowards(k, world.config.rayCount));
}

/** @type {ControllerFactory} */
function foodSeeker() {
    return eachAlive(seekFood);
}

/**
 * The thrusts of the constant-thrust controllers, as fractions of full thrust: the speeds the body-temperature sweep
 * compares (body-temperature.md). `thrust40` steers and moves as `foodSeeker` does.
 */
export const CONSTANT_THRUSTS = Object.freeze({
    thrust0: 0,
    thrust20: 0.2,
    thrust40: 0.4,
    thrust60: 0.6,
    thrust100: 1,
});

/**
 * A controller that steers towards the nearest food as `foodSeeker` does but always thrusts at one level.
 * @param {number} thrust the thrust output, 0 to 1
 * @returns {ControllerFactory}
 */
function constantThrust(thrust) {
    return () =>
        eachAlive((world, slot) => {
            const k = nearestClassRay(world, slot, CH_FOOD, CH_FOOD);
            write(world, slot, thrust, turnTowards(k, world.config.rayCount));
        });
}

/** @type {ControllerFactory} */
function spinner() {
    return eachAlive((world, slot) => write(world, slot, 0.5, 1));
}

/** @type {ControllerFactory} */
function sitter() {
    return eachAlive((world, slot) => write(world, slot, 0, 0));
}

/** @type {ControllerFactory} */
function wanderer({ world, rng }) {
    const drift = new Float64Array(world.alive.length);
    return eachAlive((w, slot) => {
        drift[slot] = Math.max(
            -WANDER_BOUND,
            Math.min(WANDER_BOUND, drift[slot] + (nextFloat(rng) - 0.5) * 2 * WANDER_STEP),
        );
        const k = nearestClassRay(w, slot, CH_FOOD, CH_FOOD);
        write(w, slot, 1, k < 0 ? drift[slot] : -turnTowards(k, w.config.rayCount));
    });
}

/** @type {ControllerFactory} */
function bumper() {
    return eachAlive((world, slot) => {
        const k = nearestClassRay(world, slot, CH_FIRST_AGENT, CH_LAST_AGENT);
        write(world, slot, 1, turnTowards(k, world.config.rayCount));
    });
}

/** @type {ControllerFactory} */
function biteSeeker() {
    return eachAlive((world, slot) => {
        const k = nearestClassRay(world, slot, CH_BIGGER, CH_BIGGER);
        write(world, slot, 1, turnTowards(k, world.config.rayCount));
    });
}

/**
 * Turns away from a wall hit ahead: rays 0, 1 and rayCount - 1 are the forward cone.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the turn output
 */
function wallTurn(world, slot) {
    const stride = world.layout.inputCount;
    const { rayCount } = world.config;
    for (const k of [0, 1, rayCount - 1]) {
        const base = slot * stride + k * RAY_CHANNELS;
        if (world.inputs[base + CH_WALL] === 1 && world.inputs[base] > WALL_NEAR) {
            return k === 1 ? -1 : 1;
        }
    }
    return 0;
}

/** @type {ControllerFactory} */
function explorerAfterMeal({ world }) {
    const owner = new Uint32Array(world.alive.length);
    const baseline = new Float64Array(world.alive.length);
    return eachAlive((w, slot) => {
        if (owner[slot] !== w.genomeId[slot]) {
            owner[slot] = w.genomeId[slot];
            baseline[slot] = w.foodEnergy[slot];
        }
        if (w.foodEnergy[slot] - baseline[slot] < MEAL_ENERGY) {
            seekFood(w, slot);
        } else {
            write(w, slot, 1, wallTurn(w, slot));
        }
    });
}

/** The controllers by name; each is a factory `create({ world, rng })` returning the `brain` phase body. */
export const SCRIPTED_CONTROLLERS = Object.freeze({
    foodSeeker,
    spinner,
    wanderer,
    bumper,
    sitter,
    explorerAfterMeal,
    biteSeeker,
    thrust0: constantThrust(CONSTANT_THRUSTS.thrust0),
    thrust20: constantThrust(CONSTANT_THRUSTS.thrust20),
    thrust40: constantThrust(CONSTANT_THRUSTS.thrust40),
    thrust60: constantThrust(CONSTANT_THRUSTS.thrust60),
    thrust100: constantThrust(CONSTANT_THRUSTS.thrust100),
});
