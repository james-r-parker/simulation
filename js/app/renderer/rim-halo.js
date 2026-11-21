// The rim falloff of an event (docs/designs/ambient-display.md, "A look that holds from across a room"): a kill, a birth
// and a pack call light the body's outline for a moment, so the event reads from across a room. The light falls off
// outward over at most `HALO_PX` device px and in at most `HALO_MS` of wall time; an idle body has none. Pure, and in
// the pack worker: per slot it keeps when the running tween began on the wall clock, so the 500 ms holds at any sim
// speed (a tween counted in ticks would last four times as long at x0.25).

import { TWEEN } from './body-tweens.js';

/** How far the falloff reaches from the rim, device px. */
export const HALO_PX = 6;
/** The longest an event's falloff lasts, wall ms. */
export const HALO_MS = 500;
/** The share of the rim colour's opacity at the rim when the strength is 1: a falloff, not a glow. */
export const HALO_ALPHA = 0.5;
/** The fraction of the strength the shader's `accent` lane word can hold below the next whole call kind. */
export const HALO_LANE_MAX = 0.999;
/** The ramp up from the event, as a share of `HALO_MS`, so the light does not pop. */
const ATTACK = 0.08;
/** The tweens that light the rim: a kill (the killer), both births (a bud and a fission) and a pack call (a howl). */
const LIGHTS = /** @type {Readonly<Record<number, boolean>>} */ (
    Object.freeze({
        [TWEEN.KILL]: true,
        [TWEEN.BUD]: true,
        [TWEEN.FISSION]: true,
        [TWEEN.HOWL]: true,
    })
);

/**
 * @typedef {object} Halos
 * @property {Float64Array} began the wall time each slot's lit tween began on the halo clock
 * @property {Float64Array} start the tick of the tween it began for
 * @property {Uint32Array} genome the body it began for
 */

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {Halos} no events
 */
export function createHalos(capacity) {
    return {
        began: new Float64Array(capacity),
        start: new Float64Array(capacity).fill(-1),
        genome: new Uint32Array(capacity),
    };
}

/**
 * @param {number} ageMs wall ms since the event
 * @returns {number} the strength, 0 to 1: a short rise, then a quadratic fall to 0 at `HALO_MS`
 */
export function haloStrength(ageMs) {
    const t = ageMs / HALO_MS;
    if (!(t >= 0) || t >= 1) {
        return 0;
    }
    const fall = 1 - t;
    return Math.min(t / ATTACK, 1) * fall * fall;
}

/**
 * @param {Halos} halos the events
 * @param {{slot: number, genome: number, kind: number, start: number, nowMs: number}} tween the body's slot, its genome,
 *   the running tween's kind (`TWEEN.NONE` when none) and start tick, and the wall time
 * @returns {number} the strength of the body's rim falloff now: 0 unless a lit tween runs, then by the wall time since
 *   it was first seen
 */
export function haloAt(halos, { slot, genome, kind, start, nowMs }) {
    if (LIGHTS[kind] !== true) {
        return 0;
    }
    if (halos.start[slot] !== start || halos.genome[slot] !== genome) {
        halos.start[slot] = start;
        halos.genome[slot] = genome;
        halos.began[slot] = nowMs;
    }
    return haloStrength(nowMs - halos.began[slot]);
}
