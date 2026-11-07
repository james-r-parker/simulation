// The shape of a reflex case's staging (brain-reflex-tests.md, Reflex cases): a staging is one input sequence for one
// brain, built from the sim's own `Stage`, and a trial is the stagings one draw gives, each also mirrored left to right.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { nextFloat } from '../sim/rng.js';
import { CENTRE_X, CENTRE_Y, HUNTER_ENERGY, PREDATOR_SPEC, SUBJECT_ENERGY, around } from './memory-probe-scenarios.js';

/** Rows in a sequence, and the leading rows `check` is not asked about (a recurrent brain may need a tick to commit). */
export const SEQUENCE_TICKS = 6;
export const SETTLE_TICKS = 2;
/** Trials a case runs by default. */
export const REFLEX_TRIALS = 16;

export const DEG = Math.PI / 180;

/**
 * @typedef {Omit<import('./pool-discrimination-stage.js').Stage, 'seed' | 'agents'> & {agents: (import('./pool-discrimination-stage.js').StagedAgent & {sizeGene?: number})[]}} StagedTick
 *   a `Stage` without its seed; an agent's `sizeGene` is turned into a weight row when the table is built
 */

/**
 * @typedef {object} Staging one input sequence for one brain
 * @property {string} kind which part of the case this is (`wall`, `too-big`, ...), for the log and the checks
 * @property {number} bearing the signed bearing in radians of the item `check` reads, in the subject's frame (positive
 *   towards positive `TURN`); 0 when there is none
 * @property {1 | -1} mirror 1 for the drawn staging and -1 for its left-right mirror image
 * @property {StagedTick[]} ticks the stage of each tick; a staging whose items do not move holds one stage, which
 *   every tick repeats, and one that moves holds `SEQUENCE_TICKS`
 */

/**
 * @typedef {object} ReflexOutputs one tick's outputs, as the sim reads them
 * @property {number} thrust `OUTPUT_INDEX.THRUST`
 * @property {number} turn `OUTPUT_INDEX.TURN`
 * @property {number} sprint `OUTPUT_INDEX.SPRINT`
 * @property {number} bite `OUTPUT_INDEX.BITE`
 */

/**
 * @typedef {object} ReflexCase
 * @property {string} name the case's name
 * @property {string} scene the scene it serves (principles.md)
 * @property {number} spec the subject's specialisation (forager 0, predator 1)
 * @property {(rng: import('../sim/rng.js').Rng, view: number) => Staging[]} plan one trial's stagings, drawn from the
 *   case's stream; `view` is the subject's ray length
 * @property {(outputs: ReflexOutputs, staging: Staging) => boolean} check whether one scored tick's outputs pass
 */

/**
 * The point at `bearing` from a subject standing at the arena's centre with heading `angle`.
 * @param {number} angle the subject's heading
 * @param {number} bearing the item's angle in the subject's frame
 * @param {number} distance from the centre
 * @returns {{x: number, y: number}} the point
 */
export function bearingPoint(angle, bearing, distance) {
    return around(angle + bearing, distance);
}

/**
 * Builds a trial's stagings for both orientations: `build(draw, 1)` as drawn and `build(draw, -1)` mirrored.
 * @template T
 * @param {T} draw what one draw of the case's stream fixed
 * @param {(draw: T, mirror: 1 | -1) => Staging[]} build the stagings of one orientation
 * @returns {Staging[]} the drawn stagings, then their mirror images
 */
export function withMirrors(draw, build) {
    return [...build(draw, 1), ...build(draw, -1)];
}

/**
 * @param {import('../sim/rng.js').Rng} rng the case's stream
 * @param {number} lowDeg the smallest size in degrees
 * @param {number} highDeg the largest size in degrees
 * @returns {number} a bearing in radians of either sign (two numbers are drawn, whatever the range)
 */
export function signedBearing(rng, lowDeg, highDeg) {
    const size = (lowDeg + nextFloat(rng) * (highDeg - lowDeg)) * DEG;
    return nextFloat(rng) < 0.5 ? -size : size;
}

/**
 * @param {number} spec the subject's specialisation
 * @param {number} angle its heading
 * @returns {import('./pool-discrimination-stage.js').StagedAgent} the subject at the arena's centre, slot 0
 */
export function subjectAgent(spec, angle) {
    const energy = spec === PREDATOR_SPEC ? HUNTER_ENERGY : SUBJECT_ENERGY;
    return { x: CENTRE_X, y: CENTRE_Y, angle, spec, energy };
}

/**
 * @param {Float32Array} outputs a world's `outputs` rows
 * @param {number} slot the slot
 * @param {ReflexOutputs} into the record to fill
 * @returns {ReflexOutputs} `into`, holding the slot's thrust, turn, sprint and bite
 */
export function readOutputs(outputs, slot, into) {
    const o = slot * OUTPUT_COUNT;
    into.thrust = outputs[o + OUTPUT_INDEX.THRUST];
    into.turn = outputs[o + OUTPUT_INDEX.TURN];
    into.sprint = outputs[o + OUTPUT_INDEX.SPRINT];
    into.bite = outputs[o + OUTPUT_INDEX.BITE];
    return into;
}
