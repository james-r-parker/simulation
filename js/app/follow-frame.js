// What the follow camera shows each frame (docs/designs/ambient-display.md, "Follow as a story"): the subject's displayed
// velocity for the look-ahead, the other body of a pursuit for pair framing, and a zoom that breathes with the subject's
// state. The zoom is eased from a base the viewer set (the entry zoom or the zoom kept over a handoff); a manual zoom
// takes over until the next handoff. Nothing is written to the camera here: `followSubject` takes the subject.

import { springStep } from './camera.js';
import { eventScore, MOVEMENT_SCORE } from './follow-target.js';

/** The zoom breathes toward its target at this rate per second (about a second to settle). */
export const BREATH_RATE = 1.2;
/** The velocity is smoothed over this time constant, ms, so one jittery frame does not swing the view. */
export const VELOCITY_TAU_MS = 150;
/** The zoom factor while the subject eats or has an event, the most a full-speed run takes off, and a pursuit's. */
export const ZOOM_FACTORS = Object.freeze({ active: 1.3, speed: 0.3, pursuit: 0.85 });

/**
 * @typedef {object} FrameState
 * @property {import('./camera.js').CameraController} camera the view
 * @property {import('./camera.js').FollowSubject} subject what `followSubject` is given
 * @property {number} prevX the subject's last displayed place
 * @property {number} prevY the subject's last displayed place
 * @property {boolean} hasPrev whether there is a last place
 * @property {number} factor the eased zoom factor
 * @property {number} base the zoom the factor scales
 * @property {number} lastZoom the zoom target this left on the camera
 * @property {boolean} manual whether the viewer has taken the zoom
 */

/**
 * @param {import('./camera.js').CameraController} camera the view
 * @returns {FrameState} a state at rest
 */
export function createFrameState(camera) {
    return {
        camera,
        subject: { x: 0, y: 0, vx: 0, vy: 0, pair: false, px: 0, py: 0, zoom: 0 },
        prevX: 0,
        prevY: 0,
        hasPrev: false,
        factor: 1,
        base: camera.targetZoom,
        lastZoom: camera.targetZoom,
        manual: false,
    };
}

/**
 * @param {FrameState} fr the state
 * @returns {void} marks the zoom as the viewer's when the camera's target is not the one this framing left
 */
function noteManual(fr) {
    fr.manual = fr.manual || Math.abs(fr.camera.targetZoom - fr.lastZoom) > 1e-9;
}

/**
 * A follow began: the zoom now is the base, whatever the framing last did.
 * @param {FrameState} fr the state
 * @returns {void}
 */
export function enterFrame(fr) {
    fr.base = fr.camera.targetZoom;
    fr.lastZoom = fr.camera.targetZoom;
    fr.factor = 1;
    fr.manual = false;
    handoffFrame(fr);
}

/**
 * The subject changed: its velocity starts again, and a manual zoom becomes the base and stops overriding.
 * @param {FrameState} fr the state
 * @returns {void}
 */
export function handoffFrame(fr) {
    noteManual(fr);
    if (fr.manual) {
        fr.base = fr.camera.targetZoom;
    }
    fr.manual = false;
    fr.lastZoom = fr.camera.targetZoom;
    fr.hasPrev = false;
    fr.subject.vx = 0;
    fr.subject.vy = 0;
}

/**
 * @param {FrameState} fr the state
 * @param {{x: number, y: number}} at the subject's displayed place
 * @param {{dtMs: number, paused: boolean}} time the frame
 * @returns {void} smooths the displayed velocity; a paused view has none
 */
function updateVelocity(fr, at, { dtMs, paused }) {
    const s = fr.subject;
    if (paused || !fr.hasPrev) {
        s.vx = 0;
        s.vy = 0;
    } else if (dtMs > 0) {
        const alpha = 1 - Math.exp(-dtMs / VELOCITY_TAU_MS);
        s.vx += (((at.x - fr.prevX) * 1000) / dtMs - s.vx) * alpha;
        s.vy += (((at.y - fr.prevY) * 1000) / dtMs - s.vy) * alpha;
    }
    fr.prevX = at.x;
    fr.prevY = at.y;
    fr.hasPrev = true;
}

/**
 * @param {import('./pursuit.js').Pursuits} pursuits this frame's pairs
 * @param {number} i the subject's index
 * @returns {number} the index of the other body of its closest pursuit, -1 when it is in none
 */
export function pursuitPartner(pursuits, i) {
    let partner = -1;
    let best = -1;
    for (let k = 0; k < pursuits.count; k++) {
        const mine = pursuits.hunter[k] === i || pursuits.prey[k] === i;
        if (mine && pursuits.closeness[k] > best) {
            best = pursuits.closeness[k];
            partner = pursuits.hunter[k] === i ? pursuits.prey[k] : pursuits.hunter[k];
        }
    }
    return partner;
}

/**
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {number} i the subject's index
 * @param {{player: import('./renderer/effects-player.js').EffectsPlayer | null, nowMs: number}} at effects and time
 * @returns {number} the zoom factor the subject's state asks for: closer when it eats or has an event, wider with speed
 *   and in a pursuit
 */
function wantedFactor(agents, i, { player, nowMs }) {
    if (player === null) {
        return 1;
    }
    const { bits, flee } = player;
    const ate = ((agents.flags[i] >> bits.ATE_SHIFT) & bits.TIMER_MASK) > 0;
    const event = eventScore(player.followInterest, agents.genomeId[i], nowMs) > MOVEMENT_SCORE;
    const run = Math.min(agents.speed[i] / flee.rules.maxVelocity, 1);
    const pursued = pursuitPartner(flee.pursuits, i) >= 0;
    return (
        (ate || event ? ZOOM_FACTORS.active : 1) * (1 - ZOOM_FACTORS.speed * run) * (pursued ? ZOOM_FACTORS.pursuit : 1)
    );
}

/**
 * Fills the subject for `followSubject`: velocity, the pursuit partner and the wanted zoom. While the view is paused the
 * subject stays where it is: no look-ahead, no pair, no zoom change.
 * @param {FrameState} fr the state
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {number} i the subject's index
 * @param {{dtMs: number, nowMs: number, paused: boolean,
 *   player: import('./renderer/effects-player.js').EffectsPlayer | null}} at the frame, with the effects player
 * @returns {import('./camera.js').FollowSubject} the subject, reused
 */
export function frameSubject(fr, agents, i, at) {
    const s = fr.subject;
    const { camera } = fr;
    s.x = agents.x[i];
    s.y = agents.y[i];
    updateVelocity(fr, s, at);
    const j = at.paused || at.player === null ? -1 : pursuitPartner(at.player.flee.pursuits, i);
    s.pair = j >= 0;
    s.px = j >= 0 ? agents.x[j] : 0;
    s.py = j >= 0 ? agents.y[j] : 0;
    noteManual(fr);
    if (fr.manual || at.paused) {
        s.zoom = 0;
        return s;
    }
    fr.factor = springStep(fr.factor, wantedFactor(agents, i, at), BREATH_RATE, at.dtMs);
    s.zoom = Math.min(Math.max(fr.base * fr.factor, camera.minZoom), camera.maxZoom);
    return s;
}

/**
 * @param {FrameState} fr the state
 * @returns {void} remembers the zoom target the camera ended with, to tell a manual change from this framing's own
 */
export function settleFrame(fr) {
    fr.lastZoom = fr.camera.targetZoom;
}
