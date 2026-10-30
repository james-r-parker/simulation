// Shared pieces of the scripted controllers: channel constants, the output writer and the food-seeking behaviour.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { turnTowards } from '../sim/merit-state.js';
import { nextFloat } from '../sim/rng.js';
import { nearestClassRay } from './observer-tick.js';

// Class channels within a ray (see js/sim/ray-march.js): THREAT can bite the caster, PREY can be bitten by it.
export const CH_FOOD = 1;
export const CH_THREAT = 2;
export const CH_PREY = 3;
export const CH_FIRST_AGENT = 2;
export const CH_LAST_AGENT = 5;
export const CH_KIN = 5;
export const CH_WALL = 6;
export const CH_SMOKE = 8;

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

/** The turn output towards a ray: the sim's `turnTowards`, shared with the merit tracker. */
export { turnTowards };

/**
 * Every controller holds the `SPLIT` output at 1, as the legacy controllers did. No rule reads it (a split needs only
 * energy and the gates), and a brain's `SPLIT` has no genes and reads 0, so the value is a record only.
 * The controllers are memoryless by design, so `MEMORY_A` and `MEMORY_B` stay at 0 (`write` clears the row first).
 */
export const SCRIPTED_SPLIT = 1;

/**
 * Writes a whole output row: thrust and turn as given, `SPLIT` at `SCRIPTED_SPLIT`, everything else 0 (the memory
 * outputs included).
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
    world.outputs[o + OUTPUT_INDEX.SPLIT] = SCRIPTED_SPLIT;
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

/** `wanderer`'s slow random turn: the per-tick step and the bound, as fractions of `maxTurn`. */
const WANDER_STEP = 0.1;
const WANDER_BOUND = 0.3;

/**
 * The wanderer's per-agent behaviour: full thrust, towards food when a ray sees it (away from it, as the wanderer
 * always has), else a slow random drift of the turn that draws one number from `rng` per call.
 * @param {Record<string, any>} world the world the controller runs on
 * @param {import('../sim/rng.js').Rng} rng the `scripted` stream
 * @returns {(w: Record<string, any>, slot: number) => void} writes one agent's outputs
 */
export function createWander(world, rng) {
    const drift = new Float64Array(world.alive.length);
    return (w, slot) => {
        drift[slot] = Math.max(
            -WANDER_BOUND,
            Math.min(WANDER_BOUND, drift[slot] + (nextFloat(rng) - 0.5) * 2 * WANDER_STEP),
        );
        const k = nearestClassRay(w, slot, CH_FOOD, CH_FOOD);
        write(w, slot, 1, k < 0 ? drift[slot] : -turnTowards(k, w.config.rayCount));
    };
}

/**
 * The ray index that points most nearly at a world position, in the frame of the agent's heading.
 * @param {Record<string, any>} w the world
 * @param {number} slot an alive agent
 * @param {number} targetX the target's x
 * @param {number} targetY the target's y
 * @returns {number} the ray index
 */
export function rayTowardPoint(w, slot, targetX, targetY) {
    const cos = detCos(w.angle[slot]);
    const sin = detSin(w.angle[slot]);
    const dx = targetX - w.x[slot];
    const dy = targetY - w.y[slot];
    let ray = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < w.config.rayCount; k++) {
        const dot = dx * (cos * w.rayCos[k] - sin * w.raySin[k]) + dy * (sin * w.rayCos[k] + cos * w.raySin[k]);
        if (dot > bestDot) {
            bestDot = dot;
            ray = k;
        }
    }
    return ray;
}

/**
 * Food energy an agent has eaten since its genome was born into the slot (the slot's baseline is taken the first time
 * the genome is seen).
 * @param {Record<string, any>} world the world the controller runs on
 * @returns {(w: Record<string, any>, slot: number) => number} the energy eaten so far
 */
export function createMealMeter(world) {
    const owner = new Uint32Array(world.alive.length);
    const baseline = new Float64Array(world.alive.length);
    return (w, slot) => {
        if (owner[slot] !== w.genomeId[slot]) {
            owner[slot] = w.genomeId[slot];
            baseline[slot] = w.foodEnergy[slot];
        }
        return w.foodEnergy[slot] - baseline[slot];
    };
}
