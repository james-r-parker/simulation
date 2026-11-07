// The live log of notable moments: each effect the player plays is scored as a single-effect moment (a kill, a pack
// kill, a smoke screen, a stampede, a first kill, a trampling) and kept when it reaches `MOMENT_THRESHOLD`, newest last,
// in a ring of `MOMENT_LOG_SIZE`. The off-view pointers read it, and `focusLast` glides the camera to the newest.
// Preallocated; noting a moment allocates nothing beyond the scorers' small result.

import { moveCameraTo } from '../camera.js';
import { scoreWorldEffect } from './moments-world.js';
import { MOMENT_THRESHOLD, scoreEffect } from './scoring.js';

/** Moments the log keeps. */
export const MOMENT_LOG_SIZE = 8;
/** How old a moment `focusLast` still glides to, ms. */
export const FOCUS_MAX_AGE_MS = 30000;
/** The least zoom `focusLast` frames a moment at, device px per world unit. */
export const FOCUS_ZOOM = 1;

/**
 * @typedef {object} MomentLog
 * @property {Float32Array} x
 * @property {Float32Array} y
 * @property {Float64Array} atMs wall time it was noted
 * @property {string[]} kind its `MOMENT_KIND`
 * @property {number} next the slot the next moment takes
 * @property {number} count moments held
 */

/**
 * @returns {MomentLog} an empty log
 */
export function createMomentLog() {
    return {
        x: new Float32Array(MOMENT_LOG_SIZE),
        y: new Float32Array(MOMENT_LOG_SIZE),
        atMs: new Float64Array(MOMENT_LOG_SIZE),
        kind: new Array(MOMENT_LOG_SIZE).fill(''),
        next: 0,
        count: 0,
    };
}

/**
 * Scores an effect as it plays and keeps it when it is notable.
 * @param {MomentLog} log the log
 * @param {{kind: number, tick: number, x: number, y: number, c: number}} effect the effect record
 * @param {{kinds: Record<string, number>, eatenCause: number, trampled: number, nowMs: number}} ctx the layout codes
 *   and the wall time
 * @returns {boolean} whether it was kept
 */
export function noteMoment(log, effect, { kinds, eatenCause, trampled, nowMs }) {
    const scored =
        scoreEffect(effect, { ageS: 0, kinds, eatenCause }) ?? scoreWorldEffect(effect, { ageS: 0, kinds, trampled });
    if (scored === null || scored.score < MOMENT_THRESHOLD) {
        return false;
    }
    const i = log.next;
    log.next = (i + 1) % MOMENT_LOG_SIZE;
    log.count = Math.min(log.count + 1, MOMENT_LOG_SIZE);
    log.x[i] = effect.x;
    log.y[i] = effect.y;
    log.atMs[i] = nowMs;
    log.kind[i] = scored.kind;
    return true;
}

/**
 * @param {MomentLog} log the log
 * @returns {number} the newest moment's slot, -1 when the log is empty
 */
export function newestMoment(log) {
    return log.count === 0 ? -1 : (log.next + MOMENT_LOG_SIZE - 1) % MOMENT_LOG_SIZE;
}

/**
 * Glides the camera to the newest moment no older than `FOCUS_MAX_AGE_MS`, at least at `FOCUS_ZOOM`.
 * @param {MomentLog | null | undefined} log the log
 * @param {import('../camera.js').CameraController} camera the view
 * @param {number} nowMs the wall time
 * @returns {boolean} whether the camera moved
 */
export function focusLast(log, camera, nowMs) {
    const i = log ? newestMoment(log) : -1;
    if (!log || i < 0 || nowMs - log.atMs[i] > FOCUS_MAX_AGE_MS) {
        return false;
    }
    moveCameraTo(camera, { x: log.x[i], y: log.y[i], zoom: Math.max(camera.zoom, FOCUS_ZOOM) });
    return true;
}
