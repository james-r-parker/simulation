// The main thread's side of one frame with the pack worker (docs/designs/pack-worker.md, "The frame"): fill the request
// from the held snapshots, the playhead, the camera, the lenses and the family colour slots, write it, take the newest
// finished frame and count it late when the worker has published nothing new since the last draw. Nothing here
// allocates per frame.

import { FAMILY_SLOTS } from '../family-slots.js';
import { createRequest, lensBits, paletteIndex, takeFrame, writeRequest } from './frame-slots.js';

/** The shortest wait between two `PackFrameLate` records, ms. */
export const LATE_REPORT_MS = 5000;

/**
 * @typedef {object} PackFeed
 * @property {import('./frame-slots.js').Request} request the request, rewritten each frame
 * @property {number} late frames drawn on an old slot since the last report
 * @property {number} lateTotal frames drawn on an old slot since the world began
 * @property {number} reportedAt the wall time of the last report, -Infinity before one
 */

/**
 * @returns {PackFeed} a feed that has sent nothing
 */
export function createPackFeed() {
    return { request: createRequest(), late: 0, lateTotal: 0, reportedAt: -Infinity };
}

/**
 * Writes this frame's request and takes the newest finished frame.
 * @param {PackFeed} feed the feed
 * @param {import('./frame-slots.js').FrameSlots} slots the frame slots
 * @param {{client: Record<string, any>, playhead: {alpha: number, tick: number}, nowMs: number,
 *   zoom: number, lenses: Record<string, boolean>, family: import('../family-slots.js').FamilySlots,
 *   tv?: boolean}} frame the held
 *   snapshots, the playhead, the clock the playhead ran on, the camera zoom, the lens flags and the colour slots
 * @returns {import('../interpolate.js').Interpolated | null} the agents of the newest published frame, null before the
 *   worker published one
 */
export function exchangeFrame(feed, slots, { client, playhead, nowMs, zoom, lenses, family, tv = false }) {
    const r = feed.request;
    r.prevSeq = client.prev?.seq ?? 0;
    r.latestSeq = client.latest.seq;
    r.alpha = playhead.alpha;
    r.tick = playhead.tick;
    r.nowMs = nowMs;
    r.zoom = zoom;
    r.lens = lensBits(lenses, tv);
    r.palette = paletteIndex(family.palette);
    for (let s = 0; s < FAMILY_SLOTS; s++) {
        r.family[s] = family.ids[s];
    }
    writeRequest(slots, r);
    const agents = takeFrame(slots);
    if (agents !== null && !slots.fresh) {
        feed.late += 1;
        feed.lateTotal += 1;
    }
    return agents;
}

/**
 * Logs `PackFrameLate` for the late frames since the last report, at most once per `LATE_REPORT_MS`.
 * @param {PackFeed} feed the feed
 * @param {{nowMs: number, seq: number, log: (level: 'warn', event: string, fields: Record<string, any>) => void}} at
 *   wall time, the sequence of the request the drawn frame answers and the log
 * @returns {void}
 */
export function reportLate(feed, { nowMs, seq, log }) {
    if (feed.late > 0 && nowMs - feed.reportedAt >= LATE_REPORT_MS) {
        log('warn', 'PackFrameLate', { late: feed.late, seq });
        feed.late = 0;
        feed.reportedAt = nowMs;
    }
}

/**
 * @param {Record<string, any> | null} snapshot the client's `latest` or `prev`
 * @param {number} seq the sequence a drawn frame was packed from
 * @returns {boolean} whether the snapshot is the one with that sequence
 */
export function isSeq(snapshot, seq) {
    return snapshot !== null && snapshot.seq === seq;
}
