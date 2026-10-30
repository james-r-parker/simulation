// Hand-written controllers for the anti-exploit suite: each replaces the `brain` phase and writes `world.outputs`
// for every alive agent from its ray inputs, so a fitness function can be scored against a known behaviour.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { nearestClassRay } from './observer-tick.js';
import { COMBAT_CONTROLLERS } from './scripted-combat.js';
import { INTENT_CONTROLLERS } from './scripted-intent.js';
import { V6_CONTROLLERS } from './scripted-v6.js';
import {
    CH_THREAT,
    CH_FIRST_AGENT,
    CH_FOOD,
    CH_LAST_AGENT,
    CH_WALL,
    SEEK_THRUST,
    createMealMeter,
    createWander,
    eachAlive,
    seekFood,
    turnTowards,
    write,
} from './scripted-parts.js';

export { SEEK_THRUST };

/** @typedef {import('./scripted-parts.js').ControllerFactory} ControllerFactory */
/** @typedef {import('./scripted-parts.js').ControllerRun} ControllerRun */

/**
 * Food energy after which `explorerAfterMeal` stops seeking food: two average food items. A foodSeeker in the
 * micro-world eats about 500 in its whole life, so a larger meal would never be finished.
 */
export const MEAL_ENERGY = 140;

/** A wall hit nearer than this proximity (1 is touching) makes `explorerAfterMeal` turn. */
const WALL_NEAR = 0.6;

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
    return eachAlive(createWander(world, rng));
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
        const k = nearestClassRay(world, slot, CH_THREAT, CH_THREAT);
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
    const stride = world.layout.rawInputCount;
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
    const eaten = createMealMeter(world);
    return eachAlive((w, slot) => {
        if (eaten(w, slot) < MEAL_ENERGY) {
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
    ...COMBAT_CONTROLLERS,
    ...INTENT_CONTROLLERS,
    ...V6_CONTROLLERS,
});
