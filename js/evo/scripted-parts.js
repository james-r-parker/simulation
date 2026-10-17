// Shared pieces of the scripted controllers: channel constants, the output writer and the food-seeking behaviour.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { nearestClassRay } from './observer-tick.js';

// Class channels within a ray (see js/sim/ray-march.js): THREAT can bite the caster, PREY can be bitten by it.
export const CH_FOOD = 1;
export const CH_THREAT = 2;
export const CH_PREY = 3;
export const CH_FIRST_AGENT = 2;
export const CH_LAST_AGENT = 5;
export const CH_WALL = 6;

/**
 * Thrust while seeking food: the speed at which a scripted forager population grows on the default economy; full thrust
 * burns more than it finds (sim-notes.md, 2026-10-16).
 */
export const SEEK_THRUST = 0.4;

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
export function turnTowards(k, rayCount) {
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
export function write(world, slot, thrust, turn) {
    const o = slot * OUTPUT_COUNT;
    world.outputs.fill(0, o, o + OUTPUT_COUNT);
    world.outputs[o + OUTPUT_INDEX.THRUST] = thrust;
    world.outputs[o + OUTPUT_INDEX.TURN] = turn;
}

/**
 * @param {(world: Record<string, any>, slot: number) => void} perAgent writes one alive agent's outputs
 * @returns {ControllerRun}
 */
export function eachAlive(perAgent) {
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
export function seekFood(world, slot) {
    const k = nearestClassRay(world, slot, CH_FOOD, CH_FOOD);
    write(world, slot, SEEK_THRUST, turnTowards(k, world.config.rayCount));
}

/**
 * Sets one output of an agent's row, leaving the others as they are.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} output an `OUTPUT_INDEX` value
 * @param {number} value the output
 * @returns {void}
 */
export function setOutput(world, slot, output, value) {
    world.outputs[slot * OUTPUT_COUNT + output] = value;
}
