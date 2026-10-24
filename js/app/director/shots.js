// Shot planning and camera poses for the Phase 4 director (`docs/designs/worker-and-renderer.md`): `wide` frames the
// middle 80% of agents (10th to 90th percentile, padded 10%, never below `fitZoom`) with a 90 s / 140 s Lissajous drift
// of 3% world width; `glide` smoothersteps to the moment in 3 s (2 s for kills); `linger` holds on the focus; `pullback`
// smoothersteps back to `wide` in 4 s.

import { fitZoom, ZOOM_IN } from '../camera.js';
import { MOMENT_KIND } from './scoring.js';

/** Shot machine states. */
export const SHOT_STATE = Object.freeze({
    WIDE: 'wide',
    GLIDE: 'glide',
    LINGER: 'linger',
    PULLBACK: 'pullback',
});

/** Lissajous drift periods (in seconds) and amplitude (as a share of world width) in `wide`. */
export const WIDE_DRIFT_PERIOD_X_S = 90;
export const WIDE_DRIFT_PERIOD_Y_S = 140;
export const WIDE_DRIFT_AMPLITUDE = 0.03;
/** Minimum and maximum durations of a `wide` shot in seconds. */
export const WIDE_MIN_S = 8;
export const WIDE_BASE_S = 20;
export const WIDE_SPAN_S = 20;
/** `linger` base duration, extension step, cap and low-score early-exit window in seconds. */
export const LINGER_BASE_S = 8;
export const LINGER_EXTEND_S = 4;
export const LINGER_MAX_S = 20;
export const LINGER_LOW_SCORE = 30;
export const LINGER_LOW_WINDOW_S = 2;
/** `pullback` duration in seconds. */
export const PULLBACK_DURATION_S = 4;

/** @type {Readonly<Record<string, number>>} */
const FRAME_WIDTH_BY_KIND = Object.freeze({
    [MOMENT_KIND.ALARM_CHORUS]: 2400,
    [MOMENT_KIND.BIRTH_CLUSTER]: 2400,
    [MOMENT_KIND.FAMILY_LEAD]: 3600,
});

/**
 * Quintic smootherstep on `[0, 1]`.
 * @param {number} t progress in `[0, 1]`
 * @returns {number} eased progress in `[0, 1]`
 */
export function smootherstep(t) {
    const x = Math.min(Math.max(t, 0), 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * World width framed by a close shot of `kind`: 1600 for combat/smoke, 2400 for clusters, 3600 for `family-lead`.
 * @param {string} kind moment kind
 * @returns {number} world units across
 */
export function momentFrameWidth(kind) {
    return FRAME_WIDTH_BY_KIND[kind] ?? 1600;
}

/**
 * Duration of a `glide` shot: 2 s for `pack-kill` and `kill`, 3 s for every other kind.
 * @param {string} kind moment kind
 * @returns {number} glide duration in seconds
 */
export function glideDurationS(kind) {
    return kind === MOMENT_KIND.PACK_KILL || kind === MOMENT_KIND.KILL ? 2 : 3;
}

/**
 * Lissajous drift offset of the `wide` camera centre at `timeS` (3% of world width, periods 90 s and 140 s).
 * @param {number} timeS simulated time in seconds
 * @param {number} worldWidth world width in world units
 * @returns {{dx: number, dy: number}} world-space offset
 */
export function wideDrift(timeS, worldWidth) {
    const amp = WIDE_DRIFT_AMPLITUDE * worldWidth;
    return {
        dx: amp * Math.sin((2 * Math.PI * timeS) / WIDE_DRIFT_PERIOD_X_S),
        dy: amp * Math.sin((2 * Math.PI * timeS) / WIDE_DRIFT_PERIOD_Y_S),
    };
}

/**
 * Computes the `wide` camera pose framing the middle 80% of agents (10th to 90th percentile in x and y, padded 10% on
 * each side, never below `fitZoom`) multiplied by `zoomScale` (1 to 1.15).
 * @param {readonly {x: number, y: number}[]} agents alive agents
 * @param {{canvas: {width: number, height: number}, world: {width: number, height: number},
 *   zoomScale?: number}} view canvas and world dimensions and optional random zoom factor
 * @returns {{x: number, y: number, zoom: number}} wide base pose (before Lissajous drift)
 */
export function wideFraming(agents, { canvas, world, zoomScale = 1 }) {
    const fit = fitZoom(canvas, world);
    if (agents.length === 0) {
        return { x: world.width / 2, y: world.height / 2, zoom: fit * zoomScale };
    }
    const xs = agents.map((a) => a.x).sort((a, b) => a - b);
    const ys = agents.map((a) => a.y).sort((a, b) => a - b);
    const lo = Math.floor((agents.length - 1) * 0.1);
    const hi = Math.ceil((agents.length - 1) * 0.9);
    const minX = xs[lo];
    const maxX = xs[hi];
    const minY = ys[lo];
    const maxY = ys[hi];
    const spanX = Math.max(1, (maxX - minX) * 1.2);
    const spanY = Math.max(1, (maxY - minY) * 1.2);
    const boxZoom = Math.min(canvas.width / spanX, canvas.height / spanY);
    const zoom = Math.min(fit * ZOOM_IN, Math.max(fit, boxZoom) * zoomScale);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
}

/**
 * @typedef {object} PlannedShot
 * @property {'wide' | 'glide' | 'linger' | 'pullback'} state shot state
 * @property {number} startTimeS simulated time (s) when the shot started
 * @property {number} durationS planned duration in seconds
 * @property {number} minDurationS earliest time (s) after `startTimeS` that `wide` may cut to a moment
 * @property {{x: number, y: number, zoom: number}} fromPose pose at the start of the shot
 * @property {{x: number, y: number, zoom: number}} toPose target pose of the shot
 * @property {import('./moments.js').MomentCandidate | null} moment active moment for `glide` and `linger`
 */

/**
 * Plans a `glide` or `linger` shot around `moment`.
 * @param {'glide' | 'linger'} state close shot state
 * @param {number} startTimeS simulated start time in seconds
 * @param {import('./moments.js').MomentCandidate} moment active moment
 * @param {{fromPose?: {x: number, y: number, zoom: number}, canvas: {width: number, height: number},
 *   world: {width: number, height: number}}} view starting pose and dimensions
 * @returns {PlannedShot} planned close shot
 */
function planCloseShot(state, startTimeS, moment, { fromPose, canvas, world }) {
    const fit = fitZoom(canvas, world);
    const isGlide = state === SHOT_STATE.GLIDE;
    const durationS = isGlide ? glideDurationS(moment.kind) : LINGER_BASE_S;
    const zoom = isGlide ? Math.max(fit, canvas.width / momentFrameWidth(moment.kind)) : (fromPose?.zoom ?? fit);
    const toPose = { x: moment.x, y: moment.y, zoom };
    return {
        state,
        startTimeS,
        durationS,
        minDurationS: durationS,
        fromPose: fromPose ?? toPose,
        toPose,
        moment,
    };
}

/**
 * Plans a `wide`, `glide`, `linger` or `pullback` shot.
 * @param {{state: 'wide' | 'glide' | 'linger' | 'pullback', startTimeS: number,
 *   fromPose?: {x: number, y: number, zoom: number}, moment?: import('./moments.js').MomentCandidate | null,
 *   agents?: readonly {x: number, y: number}[], canvas: {width: number, height: number},
 *   world: {width: number, height: number}, rng?: {next: () => number}}} input shot parameters
 * @returns {PlannedShot} the planned shot
 */
export function planShot({ state, startTimeS, fromPose, moment = null, agents = [], canvas, world, rng }) {
    if ((state === SHOT_STATE.GLIDE || state === SHOT_STATE.LINGER) && moment !== null) {
        return planCloseShot(state, startTimeS, moment, { fromPose, canvas, world });
    }
    const draw = () => rng?.next() ?? 0;
    const zoomScale = 1 + draw() * 0.15;
    const isWide = state === SHOT_STATE.WIDE;
    const durationS = isWide ? WIDE_BASE_S + draw() * WIDE_SPAN_S : PULLBACK_DURATION_S;
    const toPose = wideFraming(agents, { canvas, world, zoomScale });
    return {
        state: isWide ? SHOT_STATE.WIDE : SHOT_STATE.PULLBACK,
        startTimeS,
        durationS,
        minDurationS: isWide ? WIDE_MIN_S : PULLBACK_DURATION_S,
        fromPose: fromPose ?? toPose,
        toPose,
        moment: null,
    };
}

/**
 * Evaluates a planned shot's camera pose at `timeS`.
 * @param {PlannedShot} shot the active shot
 * @param {number} timeS current simulated time in seconds
 * @param {{width: number, height: number}} world world dimensions
 * @returns {{x: number, y: number, zoom: number}} camera pose `{x, y, zoom}`
 */
export function shotPose(shot, timeS, world) {
    if (shot.state === SHOT_STATE.WIDE) {
        const drift = wideDrift(timeS, world.width);
        return {
            x: Math.min(Math.max(shot.toPose.x + drift.dx, 0), world.width),
            y: Math.min(Math.max(shot.toPose.y + drift.dy, 0), world.height),
            zoom: shot.toPose.zoom,
        };
    }
    if (shot.state === SHOT_STATE.LINGER) {
        return { x: shot.toPose.x, y: shot.toPose.y, zoom: shot.toPose.zoom };
    }
    const u = smootherstep((timeS - shot.startTimeS) / shot.durationS);
    const drift = shot.state === SHOT_STATE.PULLBACK ? wideDrift(timeS, world.width) : { dx: 0, dy: 0 };
    const targetX = Math.min(Math.max(shot.toPose.x + drift.dx, 0), world.width);
    const targetY = Math.min(Math.max(shot.toPose.y + drift.dy, 0), world.height);
    return {
        x: shot.fromPose.x + (targetX - shot.fromPose.x) * u,
        y: shot.fromPose.y + (targetY - shot.fromPose.y) * u,
        zoom: shot.fromPose.zoom + (shot.toPose.zoom - shot.fromPose.zoom) * u,
    };
}
