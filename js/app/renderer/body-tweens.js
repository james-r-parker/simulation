// One-shot keyframed tweens on agent bodies: a lunge on a bite, a flinch when bitten, a gulp on a meal, a throb on a
// call, a bounce when courting, a pop at birth, a shake when sickness passes and the jaw clamp of a kill. Each slot holds one tween; a new one
// replaces it only when it ranks at least as high. The agent shader keys the curve from the kind and the age that
// `packAgents` writes; a slot whose genome changed drops its tween. Preallocated per slot.

/** Tween kinds; the shader branches on the same numbers. */
export const TWEEN = Object.freeze({
    NONE: 0,
    LUNGE: 1,
    FLINCH: 2,
    GULP: 3,
    CALL_THROB: 4,
    HOWL: 5,
    COURT: 6,
    BIRTH_POP: 7,
    SHAKE_OFF: 8,
    KILL: 9,
});
/** Each kind's length in ticks. */
export const TWEEN_TICKS = Object.freeze([0, 8, 10, 12, 30, 30, 20, 18, 12, 24]);
/** Each kind's rank: a running tween yields only to one of equal or higher rank. */
export const TWEEN_RANK = Object.freeze([0, 3, 4, 1, 2, 2, 1, 5, 2, 5]);

/**
 * @typedef {object} BodyTweens
 * @property {Uint8Array} kind each slot's tween, `TWEEN.NONE` when none
 * @property {Float64Array} start the tick it began
 * @property {Uint32Array} genome the body it belongs to
 */

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {BodyTweens} no tweens
 */
export function createBodyTweens(capacity) {
    return { kind: new Uint8Array(capacity), start: new Float64Array(capacity), genome: new Uint32Array(capacity) };
}

/**
 * @param {BodyTweens} tweens the tweens
 * @param {{slot: number, genome: number}} who the agent
 * @param {number} kind a `TWEEN` kind
 * @param {number} tick the tick it starts
 * @returns {boolean} whether it started (a higher-ranked running tween keeps the slot)
 */
export function startTween(tweens, { slot, genome }, kind, tick) {
    const running = tweenAge(tweens, slot, genome, tick) >= 0 ? tweens.kind[slot] : TWEEN.NONE;
    if (TWEEN_RANK[kind] < TWEEN_RANK[running]) {
        return false;
    }
    tweens.kind[slot] = kind;
    tweens.start[slot] = tick;
    tweens.genome[slot] = genome;
    return true;
}

/**
 * @param {BodyTweens} tweens the tweens
 * @param {number} slot the agent's slot
 * @param {number} genome its genome id
 * @param {number} tick the playhead tick
 * @returns {number} the running tween's age, 0 to below 1, or -1 when none runs (an ended tween, or one left by an
 *   earlier body in the slot, is cleared)
 */
export function tweenAge(tweens, slot, genome, tick) {
    const kind = tweens.kind[slot];
    if (kind === TWEEN.NONE) {
        return -1;
    }
    const age = (tick - tweens.start[slot]) / TWEEN_TICKS[kind];
    if (tweens.genome[slot] !== genome || age >= 1) {
        tweens.kind[slot] = TWEEN.NONE;
        return -1;
    }
    return Math.max(age, 0);
}
