// Blends the herd animals of the two held snapshots at the playhead, as `interpolateInto` blends agents: matched by
// slot, so herds move at the frame rate. A matched pair further apart than an animal can run between the snapshots is
// a slot reused by a calf and is drawn at its newest position. Nothing here allocates after `createHerdTrack`.

import { shortestArc } from '../interpolate.js';
import { createSections, HERD_FIELD, HERD_STRIDE, readSections } from '../snapshot-view.js';

/**
 * @typedef {object} HerdTrack
 * @property {number} count animals written
 * @property {Float32Array} x
 * @property {Float32Array} y
 * @property {Float32Array} heading radians
 * @property {Float32Array} speed 0 to 1 of the run speed
 * @property {Uint32Array} group the herd group
 * @property {Uint32Array} slot the animal slot
 * @property {Int32Array} previous scratch: the older snapshot's record index plus 1, by slot (all 0 between calls)
 * @property {import('../snapshot-view.js').Sections} older the older snapshot's sections
 * @property {import('../snapshot-view.js').Sections} newer the newer snapshot's sections
 */

/**
 * @param {number} capacity the most animals (`ready.info.herdMax`)
 * @returns {HerdTrack} the arrays `trackHerds` fills
 */
export function createHerdTrack(capacity) {
    return {
        count: 0,
        x: new Float32Array(capacity),
        y: new Float32Array(capacity),
        heading: new Float32Array(capacity),
        speed: new Float32Array(capacity),
        group: new Uint32Array(capacity),
        slot: new Uint32Array(capacity),
        previous: new Int32Array(capacity),
        older: createSections(),
        newer: createSections(),
    };
}

/**
 * @param {HerdTrack} track the track
 * @param {{u32: Uint32Array, f32: Float32Array}} next the newer snapshot
 * @param {number} i the output index
 * @param {number} n the record's word offset
 * @returns {void}
 */
function writeNewest(track, next, i, n) {
    track.x[i] = next.f32[n + HERD_FIELD.X];
    track.y[i] = next.f32[n + HERD_FIELD.Y];
    track.heading[i] = next.f32[n + HERD_FIELD.HEADING];
    track.speed[i] = next.f32[n + HERD_FIELD.SPEED];
    track.group[i] = next.u32[n + HERD_FIELD.GROUP];
    track.slot[i] = next.u32[n + HERD_FIELD.SLOT];
}

/**
 * Scratch for `blendHerd`: the older record's word offset, alpha and the farthest an animal can move between the two
 * snapshots. A typed array, so storing a double never boxes it.
 */
const AT = new Float64Array(3);

/**
 * Moves animal `i` from its older record towards the newest values already written, unless it jumped too far.
 * @param {HerdTrack} track the track holding the newest values
 * @param {Float32Array} g the older snapshot's floats
 * @param {number} i the output index
 * @returns {void}
 */
function blendHerd(track, g, i) {
    const p = AT[0];
    const alpha = AT[1];
    const fromX = g[p + HERD_FIELD.X];
    const fromY = g[p + HERD_FIELD.Y];
    const dx = track.x[i] - fromX;
    const dy = track.y[i] - fromY;
    if (dx * dx + dy * dy > AT[2] * AT[2]) {
        return;
    }
    track.x[i] = fromX + dx * alpha;
    track.y[i] = fromY + dy * alpha;
    const from = g[p + HERD_FIELD.HEADING];
    track.heading[i] = from + shortestArc(from, track.heading[i]) * alpha;
    const speed = g[p + HERD_FIELD.SPEED];
    track.speed[i] = speed + (track.speed[i] - speed) * alpha;
}

/**
 * Blends the herds of two snapshots into `track`.
 * @param {{u32: Uint32Array, f32: Float32Array} | null} prev the older snapshot, null when there is only one
 * @param {{u32: Uint32Array, f32: Float32Array}} next the newer snapshot
 * @param {number} alpha 0 for `prev`, 1 for `next`
 * @param {{track: HerdTrack, runSpeed: number, radius: number}} into the track, and `ready.info.herdRunSpeed` and
 *   `herdRadius` for the reuse rule
 * @returns {number} the animal count
 */
export function trackHerds(prev, next, alpha, { track, runSpeed, radius }) {
    const newer = readSections(next.u32, track.newer);
    const older = prev === null ? null : readSections(prev.u32, track.older);
    const { previous } = track;
    const prevCount = older === null ? 0 : Math.min(older.herdCount, previous.length);
    for (let i = 0; i < prevCount; i++) {
        const slot = /** @type {any} */ (prev).u32[
            /** @type {any} */ (older).herdStart + i * HERD_STRIDE + HERD_FIELD.SLOT
        ];
        if (slot < previous.length) {
            previous[slot] = i + 1;
        }
    }
    const count = Math.min(newer.herdCount, track.x.length);
    const ticks = prev !== null && next.u32[0] > prev.u32[0] ? next.u32[0] - prev.u32[0] : 1;
    AT[1] = alpha;
    AT[2] = runSpeed * ticks + radius;
    for (let i = 0; i < count; i++) {
        const n = newer.herdStart + i * HERD_STRIDE;
        writeNewest(track, next, i, n);
        const slot = track.slot[i];
        const index = slot < previous.length ? previous[slot] : 0;
        if (index > 0) {
            AT[0] = /** @type {any} */ (older).herdStart + (index - 1) * HERD_STRIDE;
            blendHerd(track, /** @type {any} */ (prev).f32, i);
        }
    }
    previous.fill(0);
    track.count = count;
    return count;
}
