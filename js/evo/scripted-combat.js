// Combat controllers for the anti-exploit suite and the predator-prey metrics: a hunter, a fleer, and two spammers
// that hold one call output on every tick. Each zeroes the agent's output row, then writes all it needs.

import { OUTPUT_INDEX, RAY_CHANNELS } from '../sim/brain-layout.js';
import { nearestClassRay } from './observer-tick.js';
import { CH_THREAT, CH_PREY, eachAlive, seekFood, setOutput, turnTowards, write } from './scripted-parts.js';

/** Offsets within the body inputs (see predator-prey.md, Brain layout). */
const BODY_BITTEN = 12;
const BODY_ATTACK_LEFT = 21;
const BODY_ATTACK_RIGHT = 22;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} offset a body input offset
 * @returns {number} the input's value
 */
function bodyInput(world, slot, offset) {
    return world.inputs[slot * world.layout.inputCount + world.config.rayCount * RAY_CHANNELS + offset];
}

/**
 * The turn that follows the stronger attack antenna: +1 for the left (the positive side), -1 for the right, 0 when
 * neither smells anything or they match.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the turn output
 */
function attackTurn(world, slot) {
    const left = bodyInput(world, slot, BODY_ATTACK_LEFT);
    const right = bodyInput(world, slot, BODY_ATTACK_RIGHT);
    if (left === right) {
        return 0;
    }
    return left > right ? 1 : -1;
}

/**
 * Remembers, per slot and per genome, whether a sighting was already seen on the last tick, so a call fires only when
 * something first comes into view.
 * @param {Record<string, any>} world the world the controller runs on
 * @returns {(w: Record<string, any>, slot: number, seesNow: boolean) => boolean} true on the tick a sighting begins
 */
function sightings(world) {
    const owner = new Uint32Array(world.alive.length);
    const seen = new Uint8Array(world.alive.length);
    return (w, slot, seesNow) => {
        if (owner[slot] !== w.genomeId[slot]) {
            owner[slot] = w.genomeId[slot];
            seen[slot] = 0;
        }
        const first = seesNow && seen[slot] === 0;
        seen[slot] = seesNow ? 1 : 0;
        return first;
    };
}

/** @type {import('./scripted-parts.js').ControllerFactory} */
function hunter({ world }) {
    const firstSight = sightings(world);
    return eachAlive((w, slot) => {
        const k = nearestClassRay(w, slot, CH_PREY, CH_PREY);
        const scent = attackTurn(w, slot);
        if (k < 0 && scent === 0) {
            seekFood(w, slot);
            firstSight(w, slot, false);
            return;
        }
        write(w, slot, 1, k >= 0 ? turnTowards(k, w.config.rayCount) : scent);
        if (k >= 0) {
            setOutput(w, slot, OUTPUT_INDEX.SPRINT, 1);
            setOutput(w, slot, OUTPUT_INDEX.BITE, 1);
        }
        if (firstSight(w, slot, k >= 0)) {
            setOutput(w, slot, OUTPUT_INDEX.HUNT, 1);
        }
    });
}

/**
 * The turn that steers away from the nearest "can bite me" agent: the side opposite to its ray, and to the left when it is
 * dead ahead; dead behind it needs no turn.
 * @param {number} k the ray index of the threat
 * @param {number} rayCount rays per agent
 * @returns {number} the turn output
 */
function turnAway(k, rayCount) {
    if (k === 0) {
        return 1;
    }
    return 2 * k === rayCount ? 0 : -turnTowards(k, rayCount);
}

/**
 * Steers a fleer: away from the nearest "can bite me" agent at a sprint, else away from the stronger attack antenna, else
 * towards food.
 * @param {Record<string, any>} w the world
 * @param {number} slot the agent
 * @param {number} k the ray index of the nearest "can bite me" agent, or -1
 * @returns {void}
 */
function steerFleer(w, slot, k) {
    const scent = -attackTurn(w, slot);
    if (k < 0 && scent === 0) {
        seekFood(w, slot);
        return;
    }
    const away = k >= 0 ? turnAway(k, w.config.rayCount) : 0;
    write(w, slot, 1, Math.max(-1, Math.min(1, away + scent)));
    if (k >= 0) {
        setOutput(w, slot, OUTPUT_INDEX.SPRINT, 1);
    }
}

/** @type {import('./scripted-parts.js').ControllerFactory} */
function fleer({ world }) {
    const firstSight = sightings(world);
    return eachAlive((w, slot) => {
        const k = nearestClassRay(w, slot, CH_THREAT, CH_THREAT);
        steerFleer(w, slot, k);
        if (firstSight(w, slot, k >= 0)) {
            setOutput(w, slot, OUTPUT_INDEX.ALARM, 1);
        }
        if (bodyInput(w, slot, BODY_BITTEN) > 0) {
            setOutput(w, slot, OUTPUT_INDEX.SMOKE, 1);
        }
    });
}

/**
 * @param {number} output the `OUTPUT_INDEX` value to hold at 1
 * @returns {import('./scripted-parts.js').ControllerFactory} a controller that seeks food and sets that output
 */
function spammer(output) {
    return () =>
        eachAlive((w, slot) => {
            seekFood(w, slot);
            setOutput(w, slot, output, 1);
        });
}

/** The combat controllers by name, merged into `SCRIPTED_CONTROLLERS`. */
export const COMBAT_CONTROLLERS = Object.freeze({
    hunter,
    fleer,
    alarmSpammer: spammer(OUTPUT_INDEX.ALARM),
    smokeSpammer: spammer(OUTPUT_INDEX.SMOKE),
});
