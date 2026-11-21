// Shot planning and camera poses for the Phase 4 director (`docs/designs/worker-and-renderer.md`): `wide` frames the
// middle 80% of agents (10th to 90th percentile, padded 10%, never below `homeZoom`: the whole world on a landscape
// canvas, the height fill on a portrait one, so a shot never shows the world as a band) with a 90 s / 140 s Lissajous drift
// of 3% world width; `glide` is a calm move (`../camera-move.js`: zoom out, pan, zoom in, at the comfort caps) to the
// moment; `linger` holds on the focus; `pullback` is the same move back to `wide`, and so is every new `wide` framing.

import { homeZoom } from '../camera.js';
import { ease, movePose, planMove } from '../camera-move.js';
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
/** Minimum and base durations and random span of a `wide` shot's hold, in seconds, after its move. */
export const WIDE_MIN_S = 30;
export const WIDE_BASE_S = 30;
export const WIDE_SPAN_S = 30;
/** `linger` base duration, extension step, cap and low-score early-exit window in seconds. */
export const LINGER_BASE_S = 16;
export const LINGER_EXTEND_S = 4;
export const LINGER_MAX_S = 40;
export const LINGER_LOW_SCORE = 30;
export const LINGER_LOW_WINDOW_S = 2;

/** @type {Readonly<Record<string, number>>} */
const FRAME_WIDTH_BY_KIND = Object.freeze({
    [MOMENT_KIND.ALARM_CHORUS]: 4800,
    [MOMENT_KIND.BIRTH_CLUSTER]: 4800,
    [MOMENT_KIND.FAMILY_LEAD]: 6000,
});

/** The closest a shot goes, a multiple of `homeZoom`: 4 is a quarter of the world across (3600 units of 14400). */
export const CLOSEST_ZOOM_IN = 4;

export { ease as smootherstep } from '../camera-move.js';

/**
 * World width framed by a close shot of `kind`: 3600 for combat/smoke, 4800 for clusters, 6000 for `family-lead`.
 * @param {string} kind moment kind
 * @returns {number} world units across
 */
export function momentFrameWidth(kind) {
    return FRAME_WIDTH_BY_KIND[kind] ?? 3600;
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
 * each side, never below `homeZoom`) multiplied by `zoomScale` (1 to 1.15).
 * @param {readonly {x: number, y: number}[]} agents alive agents
 * @param {{canvas: {width: number, height: number}, world: {width: number, height: number},
 *   zoomScale?: number}} view canvas and world dimensions and optional random zoom factor
 * @returns {{x: number, y: number, zoom: number}} wide base pose (before Lissajous drift)
 */
export function wideFraming(agents, { canvas, world, zoomScale = 1 }) {
    const home = homeZoom(canvas, world);
    if (agents.length === 0) {
        return { x: world.width / 2, y: world.height / 2, zoom: home * zoomScale };
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
    const zoom = Math.min(home * CLOSEST_ZOOM_IN, Math.max(home, boxZoom) * zoomScale);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
}

/**
 * @typedef {object} PlannedShot
 * @property {'wide' | 'glide' | 'linger' | 'pullback'} state shot state
 * @property {number} startTimeS simulated time (s) when the shot started
 * @property {number} durationS planned duration in seconds; a `glide` and a `pullback` last as long as their move
 * @property {number} minDurationS earliest time (s) after `startTimeS` that `wide` may cut to a moment
 * @property {{x: number, y: number, zoom: number}} fromPose pose at the start of the shot
 * @property {{x: number, y: number, zoom: number}} toPose target pose of the shot
 * @property {import('../camera-move.js').Move | null} move the move from `fromPose` to `toPose`; null for `linger`
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
    const home = homeZoom(canvas, world);
    const isGlide = state === SHOT_STATE.GLIDE;
    const frameZoom = Math.min(home * CLOSEST_ZOOM_IN, Math.max(home, canvas.width / momentFrameWidth(moment.kind)));
    const zoom = isGlide ? frameZoom : (fromPose?.zoom ?? home);
    const toPose = { x: moment.x, y: moment.y, zoom };
    const move = isGlide ? planMove(fromPose ?? toPose, toPose, { canvas, world }) : null;
    const durationS = move?.durationS ?? LINGER_BASE_S;
    return {
        state,
        startTimeS,
        durationS,
        minDurationS: durationS,
        fromPose: fromPose ?? toPose,
        toPose,
        move,
        moment,
    };
}

/**
 * Plans a `wide` shot or a `pullback`: the move from `fromPose` to a wide framing of the agents.
 * @param {'wide' | 'pullback'} state the shot state
 * @param {number} startTimeS simulated start time in seconds
 * @param {{fromPose?: {x: number, y: number, zoom: number}, agents: readonly {x: number, y: number}[],
 *   canvas: {width: number, height: number}, world: {width: number, height: number},
 *   rng?: {next: () => number}}} input starting pose, agents, dimensions and random source
 * @returns {PlannedShot} the planned shot
 */
function planWideShot(state, startTimeS, { fromPose, agents, canvas, world, rng }) {
    const draw = () => rng?.next() ?? 0;
    const toPose = wideFraming(agents, { canvas, world, zoomScale: 1 + draw() * 0.15 });
    const move = planMove(fromPose ?? toPose, toPose, { canvas, world });
    const isWide = state === SHOT_STATE.WIDE;
    return {
        state,
        startTimeS,
        durationS: isWide ? move.durationS + WIDE_BASE_S + draw() * WIDE_SPAN_S : move.durationS,
        minDurationS: isWide ? move.durationS + WIDE_MIN_S : move.durationS,
        fromPose: fromPose ?? toPose,
        toPose,
        move,
        moment: null,
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
    const wideState = state === SHOT_STATE.WIDE ? SHOT_STATE.WIDE : SHOT_STATE.PULLBACK;
    return planWideShot(wideState, startTimeS, { fromPose, agents, canvas, world, rng });
}

/**
 * Evaluates a planned shot's camera pose at `timeS`: `linger` holds on its focus; `glide`, `pullback` and `wide` run
 * their move and then (`pullback`, `wide`) drift, the drift blended in over the move so the pose never steps.
 * @param {PlannedShot} shot the active shot
 * @param {number} timeS current simulated time in seconds
 * @param {{width: number, height: number}} world world dimensions
 * @returns {{x: number, y: number, zoom: number}} camera pose `{x, y, zoom}`
 */
export function shotPose(shot, timeS, world) {
    if (shot.state === SHOT_STATE.LINGER || shot.move === null) {
        return { x: shot.toPose.x, y: shot.toPose.y, zoom: shot.toPose.zoom };
    }
    const elapsedS = timeS - shot.startTimeS;
    const base = movePose(shot.move, elapsedS);
    if (shot.state === SHOT_STATE.GLIDE) {
        return base;
    }
    const blend = shot.move.durationS > 0 ? ease(elapsedS / shot.move.durationS) : 1;
    const drift = wideDrift(timeS, world.width);
    base.x = Math.min(Math.max(base.x + drift.dx * blend, 0), world.width);
    base.y = Math.min(Math.max(base.y + drift.dy * blend, 0), world.height);
    return base;
}
