// The death animation of each cause, three beats on the wall clock (docs/designs/ambient-display.md, "A death that
// reads"): the body fails (its live loops slow to rest), the membrane breaks over a beat that depends on the cause (a
// clip squashes the body, a tear opens in its outline and its colour drains to rot), then what is left fades. Pure data
// and the clock maths; `dying.js` holds the bodies and `dying-pack.js` writes each beat's values to the row.

import { TWEEN } from './body-tweens.js';

/**
 * @typedef {object} Tear how the membrane opens in the breaking beat
 * @property {'bite' | 'low' | 'side' | 'hash' | 'heading' | 'none'} where the bearing the gap opens from: towards the
 *   killer (`bite`), the lowest point (`low`), a quarter turn from the heading (`side`), a bearing of the body's own
 *   (`hash`), the heading (`heading`); `none` opens no gap
 * @property {number} depth how far the gap cuts in, a share of the radius (1 reaches the centre)
 * @property {number} width the arc of one gap, radians
 * @property {boolean} scatter whether the gap repeats at three bearings round the membrane
 */

/**
 * @typedef {object} DeathAnim
 * @property {string} clip a `CLIPS` name, played over the breaking beat
 * @property {number} kind the `TWEEN` kind that plays it on a dying row
 * @property {number} breakMs the breaking beat's length, wall time
 * @property {number} leaveMs the leaving beat's length, wall time
 * @property {number} ms the whole death's length, wall time: `FAIL_MS` plus both beats
 * @property {Tear} tear the membrane's tear
 * @property {boolean} carcass whether the body ends as the carcass the kill leaves: its clip ends at `CARCASS_SCALE`
 */

/** The carcass model's size as a share of the body: an eaten body's clip ends at it. */
export const CARCASS_SCALE = 0.7;
/** The failing beat's length, ms: the body keeps its live loops while its speed slows to rest. */
export const FAIL_MS = 400;
/** The breaking beat's shortest and longest length, ms. */
export const BREAK_MS = Object.freeze({ min: 500, max: 1400 });
/** The leaving beat's shortest and longest length, ms. */
export const LEAVE_MS = Object.freeze({ min: 400, max: 800 });
/** The shortest and the longest a death may last, ms. */
export const DEATH_MS = Object.freeze({
    min: FAIL_MS + BREAK_MS.min + LEAVE_MS.min,
    max: FAIL_MS + BREAK_MS.max + LEAVE_MS.max,
});

/**
 * @param {{clip: string, kind: number, breakMs: number, leaveMs: number, tear: Partial<Tear>, carcass?: boolean}} spec
 *   the cause's clip, beats and tear
 * @returns {Readonly<DeathAnim>} its animation
 */
function makeAnim({ clip, kind, breakMs, leaveMs, tear, carcass = false }) {
    const full = { where: 'none', depth: 0, width: 0.4, scatter: false, ...tear };
    return Object.freeze({
        clip,
        kind,
        breakMs,
        leaveMs,
        ms: FAIL_MS + breakMs + leaveMs,
        tear: Object.freeze(/** @type {Tear} */ (full)),
        carcass,
    });
}

/** The animation of each `DEATH_CAUSE` name. */
export const DEATH_ANIMS = Object.freeze({
    EATEN: makeAnim({
        clip: 'rupture',
        kind: TWEEN.RUPTURE,
        breakMs: 600,
        leaveMs: 600,
        tear: { where: 'bite', depth: 0.95, width: 0.45 },
        carcass: true,
    }),
    STARVED: makeAnim({
        clip: 'deflate',
        kind: TWEEN.DEFLATE,
        breakMs: 1200,
        leaveMs: 700,
        tear: { where: 'low', depth: 0.9, width: 0.5 },
    }),
    OLD_AGE: makeAnim({ clip: 'wither', kind: TWEEN.WITHER, breakMs: 1400, leaveMs: 800, tear: { where: 'none' } }),
    POISONED: makeAnim({
        clip: 'convulse',
        kind: TWEEN.CONVULSE,
        breakMs: 1000,
        leaveMs: 600,
        tear: { where: 'hash', depth: 0.55, width: 0.3, scatter: true },
    }),
    COLLISION: makeAnim({
        clip: 'crumple',
        kind: TWEEN.CRUMPLE,
        breakMs: 500,
        leaveMs: 400,
        tear: { where: 'heading', depth: 0.95, width: 0.3 },
    }),
    TRAMPLED: makeAnim({
        clip: 'flatten',
        kind: TWEEN.FLATTEN,
        breakMs: 700,
        leaveMs: 500,
        tear: { where: 'side', depth: 0.9, width: 0.4 },
    }),
    DISEASE: makeAnim({
        clip: 'pit',
        kind: TWEEN.PIT,
        breakMs: 1100,
        leaveMs: 600,
        tear: { where: 'hash', depth: 0.45, width: 0.25, scatter: true },
    }),
});

/** What a cause name the table does not know plays, and a body whose cause never arrived. */
export const DEFAULT_DEATH = 'STARVED';

/**
 * @param {string | undefined} cause a death cause name (`ready.layout.deathCauses`)
 * @returns {DeathAnim} its animation, the starvation one for an unknown name
 */
export function animFor(cause) {
    return /** @type {Record<string, DeathAnim>} */ (DEATH_ANIMS)[cause ?? DEFAULT_DEATH] ?? DEATH_ANIMS[DEFAULT_DEATH];
}

/**
 * @param {number} u a value
 * @returns {number} it clamped to 0 to 1 and eased smoothly
 */
function smooth(u) {
    const c = Math.min(Math.max(u, 0), 1);
    return c * c * (3 - 2 * c);
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} elapsedMs wall time since the death began
 * @returns {number} the progress of the whole death, 0 to 1
 */
export function progressOf(anim, elapsedMs) {
    return Math.min(Math.max(elapsedMs / anim.ms, 0), 1);
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} elapsedMs wall time since the death began
 * @returns {number} the progress of the breaking beat, 0 until it starts and 1 once it ends: the clip's age
 */
export function breakOf(anim, elapsedMs) {
    return Math.min(Math.max((elapsedMs - FAIL_MS) / anim.breakMs, 0), 1);
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} elapsedMs wall time since the death began
 * @returns {number} how far the membrane has torn and its colour drained to rot: 0 while failing, a smooth rise over
 *   the breaking beat, 1 from then on; monotonic
 */
export function tearOf(anim, elapsedMs) {
    return smooth(breakOf(anim, elapsedMs));
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} elapsedMs wall time since the death began
 * @returns {number} how far the body has faded out: 0 until the breaking beat ends, then a smooth rise to 1 over the
 *   leaving beat, so no opacity falls before the rim has drained
 */
export function fadeOf(anim, elapsedMs) {
    return smooth((elapsedMs - FAIL_MS - anim.breakMs) / anim.leaveMs);
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} elapsedMs wall time since the death began
 * @returns {number} the value the row's fade lane carries: the tear (0 to 1) plus the fade (0 to 1), 0 to 2, monotonic
 */
export function laneOf(anim, elapsedMs) {
    return tearOf(anim, elapsedMs) + fadeOf(anim, elapsedMs);
}

const QUARTER = Math.PI / 2;

/**
 * @param {Tear} tear a tear
 * @param {{bearing: number, genome: number}} body the body's stored bearing (towards its killer when it was eaten, else
 *   its heading) and its genome
 * @returns {number} the world bearing the gap opens from, radians
 */
export function tearBearing(tear, { bearing, genome }) {
    switch (tear.where) {
        case 'low':
            return -QUARTER;
        case 'side':
            return bearing + QUARTER;
        case 'hash':
            return ((genome * 0.6180339) % 1) * 2 * Math.PI;
        case 'none':
            return 0;
        default:
            return bearing;
    }
}
