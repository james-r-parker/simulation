// The calm camera move (docs/designs/ambient-display.md, "A calm camera"): every change of subject is zoom out until
// both subjects sit inside the view, pan, zoom in. Each leg is a smootherstep, so the pan speed and the zoom rate are
// zero at every joint. The caps are on the peak of the ease, so no frame is faster. Pure: a plan from two poses and a
// pose as a function of time.

import { fitZoom } from './camera.js';

/** The fastest the view may pan, canvas widths a second, at the peak of the ease (comfort guidance: about a third). */
export const MAX_PAN_SCREENS_PER_S = 1 / 3;
/** The pan speed when the next subject is already on screen and the zoom out is skipped. */
export const SLOW_PAN_SCREENS_PER_S = 1 / 6;
/** The fastest the zoom may change, a factor a second, at the peak of the ease (comfort guidance: about 1.5). */
export const MAX_ZOOM_FACTOR_PER_S = 1.5;
/** The centred share of the view both subjects must sit inside before the pan. */
export const BOTH_FIT_SHARE = 0.7;
/** The peak of a smootherstep's slope: its fastest frame is this times the mean speed of the leg. */
export const EASE_PEAK = 15 / 8;

/**
 * @typedef {{x: number, y: number, zoom: number}} Pose
 * @typedef {object} Move
 * @property {Pose} from the pose it leaves
 * @property {Pose} to the pose it reaches
 * @property {number} midZoom the zoom of the pan
 * @property {number} outS seconds of the zoom out
 * @property {number} panS seconds of the pan
 * @property {number} inS seconds of the zoom in
 * @property {number} durationS the whole move, seconds
 * @property {boolean} slow whether the next subject was already on screen, so the pan is the slow one
 */

/**
 * @param {number} t progress
 * @returns {number} quintic smootherstep of `t` clamped to `[0, 1]`
 */
export function ease(t) {
    const x = Math.min(Math.max(t, 0), 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * @param {number} a a zoom
 * @param {number} b another zoom
 * @returns {number} seconds a zoom leg between them takes at the zoom-rate cap
 */
function zoomLegS(a, b) {
    return (Math.abs(Math.log(b / a)) * EASE_PEAK) / Math.log(MAX_ZOOM_FACTOR_PER_S);
}

/**
 * @param {Pose} from the pose the move leaves
 * @param {Pose} to the pose it reaches
 * @param {{canvas: {width: number, height: number}, world: {width: number, height: number}}} view the canvas in device
 *   pixels and the world in world units
 * @returns {Move} the move: zoom out to the highest zoom at which both points sit inside the middle `BOTH_FIT_SHARE`
 *   (never closer than `from`, never closer than `to`, never wider than the whole world), pan, zoom in
 */
export function planMove(from, to, { canvas, world }) {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const both = BOTH_FIT_SHARE * Math.min(canvas.width / Math.max(dx, 1e-9), canvas.height / Math.max(dy, 1e-9));
    const midZoom = Math.min(from.zoom, to.zoom, Math.max(both, fitZoom(canvas, world)));
    const slow = midZoom >= from.zoom;
    const cap = slow ? SLOW_PAN_SCREENS_PER_S : MAX_PAN_SCREENS_PER_S;
    const outS = zoomLegS(from.zoom, midZoom);
    const panS = (Math.hypot(dx, dy) * midZoom * EASE_PEAK) / (canvas.width * cap);
    const inS = zoomLegS(midZoom, to.zoom);
    return { from, to, midZoom, outS, panS, inS, durationS: outS + panS + inS, slow };
}

/**
 * @param {Move} move the move
 * @param {number} tS seconds since it began
 * @param {{to?: Pose, out?: Pose}} [live] `to`: where the move ends now, when the subject has moved since the plan;
 *   `out`: receives the pose
 * @returns {Pose} the pose at `tS`: the start before it, the end after it
 */
export function movePose(move, tS, { to = move.to, out = { x: 0, y: 0, zoom: 0 } } = {}) {
    const { from, midZoom } = move;
    const pan = move.panS > 0 ? ease((tS - move.outS) / move.panS) : tS >= move.outS ? 1 : 0;
    out.x = from.x + (to.x - from.x) * pan;
    out.y = from.y + (to.y - from.y) * pan;
    if (tS < move.outS + move.panS) {
        out.zoom = from.zoom * Math.exp(Math.log(midZoom / from.zoom) * (move.outS > 0 ? ease(tS / move.outS) : 1));
    } else {
        const u = move.inS > 0 ? ease((tS - move.outS - move.panS) / move.inS) : 1;
        out.zoom = midZoom * Math.exp(Math.log(to.zoom / midZoom) * u);
    }
    return out;
}
