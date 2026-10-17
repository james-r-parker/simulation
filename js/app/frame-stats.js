// Frame-interval and draw-time rings with their percentiles, and the measured refresh rate. The percentile and ring
// helpers come from the legacy probe until Phase 5 moves them here.

import { createFrameRing, percentile } from '../dev/perf-probe.js';

/** Intervals over this many ms (a stall, a debugger, a throttled tab) are not frames and are ignored. */
export const MAX_INTERVAL_MS = 250;

/** The share of the fastest intervals whose upper edge is taken as the refresh interval. */
const REFRESH_PERCENTILE = 25;

/**
 * @typedef {object} FrameStats
 * @property {{push: (ms: number) => void, values: () => Float64Array}} intervals frame intervals in ms
 * @property {{push: (ms: number) => void, values: () => Float64Array}} draws time spent in the frame callback in ms
 */

/**
 * @param {number} [capacity] samples each ring keeps
 * @returns {FrameStats} empty rings
 */
export function createFrameStats(capacity) {
    return { intervals: createFrameRing(capacity), draws: createFrameRing(capacity) };
}

/**
 * Records one frame. An interval recorded while the tab is hidden, or over `MAX_INTERVAL_MS`, is ignored.
 * @param {FrameStats} stats the rings
 * @param {number} intervalMs ms since the previous `requestAnimationFrame` callback
 * @param {number} drawMs ms spent in this callback
 * @param {boolean} [hidden] whether the tab is hidden
 * @returns {boolean} whether the frame was recorded
 */
export function recordFrame(stats, intervalMs, drawMs, hidden = false) {
    if (hidden || !(intervalMs > 0) || intervalMs > MAX_INTERVAL_MS) {
        return false;
    }
    stats.intervals.push(intervalMs);
    stats.draws.push(drawMs);
    return true;
}

/**
 * @param {Float64Array} values unsorted samples; sorted in place
 * @returns {{p50: number, p95: number, p99: number}} their percentiles, rounded to 2 decimals
 */
export function spread(values) {
    const sorted = values.sort();
    const r = (/** @type {number} */ p) => Math.round(percentile(sorted, p) * 100) / 100;
    return { p50: r(50), p95: r(95), p99: r(99) };
}

/**
 * Summarises the rings. Allocates; call it about once a second, not every frame.
 * @param {FrameStats} stats the rings
 * @returns {{frames: number, frameMs: {p50: number, p95: number, p99: number}, drawMs: {p50: number, p95: number, p99: number}, refreshMs: number, refreshHz: number}}
 *   `refreshMs` is the measured refresh interval (0 before any frame): the 25th percentile of the intervals, so a
 *   run of dropped frames does not stretch it
 */
export function frameReport(stats) {
    const intervals = stats.intervals.values();
    const refreshMs = percentile(intervals.slice().sort(), REFRESH_PERCENTILE);
    return {
        frames: intervals.length,
        frameMs: spread(intervals),
        drawMs: spread(stats.draws.values()),
        refreshMs,
        refreshHz: refreshMs > 0 ? Math.round(10000 / refreshMs) / 10 : 0,
    };
}
