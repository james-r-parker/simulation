// The reel's ring of the camera and the followed subject: the last 12 s, one sample every 100 ms, in typed arrays
// (writing a sample allocates nothing), and the score of a moment: how many instances of a scene came lately.

/** The ring's length and sample spacing in ms. */
export const RING_MS = 12_000;
export const SAMPLE_MS = 100;
/** Samples the ring holds. */
export const RING_SAMPLES = RING_MS / SAMPLE_MS;
/** Ticks a moment's score looks back over (10 s at 60 ticks a second). */
export const DENSITY_TICKS = 600;
/** The recent instances kept per scene for the score. */
export const RECENT = 32;

/**
 * @typedef {{x: number, y: number, zoom: number, followId: number}} View the camera and the follow
 */

/**
 * @typedef {object} Ring
 * @property {Float32Array} view x, y and zoom per sample
 * @property {Uint32Array} follow the followed genome per sample
 * @property {number} n samples written since the world began
 * @property {number} lastMs when the newest sample was written
 */

/** @returns {Ring} an empty ring */
export function createRing() {
    return {
        view: new Float32Array(RING_SAMPLES * 3),
        follow: new Uint32Array(RING_SAMPLES),
        n: 0,
        lastMs: -Infinity,
    };
}

/**
 * Writes a sample when `SAMPLE_MS` have passed since the last.
 * @param {Ring} ring the ring
 * @param {View & {nowMs: number}} view the time, the camera and the follow
 * @returns {void}
 */
export function pushSample(ring, view) {
    if (view.nowMs - ring.lastMs < SAMPLE_MS) {
        return;
    }
    ring.lastMs = view.nowMs;
    const at = ring.n % RING_SAMPLES;
    ring.view[at * 3] = view.x;
    ring.view[at * 3 + 1] = view.y;
    ring.view[at * 3 + 2] = view.zoom;
    ring.follow[at] = view.followId;
    ring.n += 1;
}

/**
 * @param {Ring} ring the ring (`note` writes a sample before it looks for a moment, so it is never empty)
 * @returns {View} the newest sample
 */
export function newest(ring) {
    const at = (ring.n - 1) % RING_SAMPLES;
    return { x: ring.view[at * 3], y: ring.view[at * 3 + 1], zoom: ring.view[at * 3 + 2], followId: ring.follow[at] };
}

/**
 * @param {Int32Array} recent a scene's recent instance ticks
 * @param {number} tick the tick now
 * @returns {number} how many are within `DENSITY_TICKS` up to it
 */
export function density(recent, tick) {
    let n = 0;
    for (const t of recent) {
        n += t >= 0 && t <= tick && tick - t < DENSITY_TICKS ? 1 : 0;
    }
    return n;
}
