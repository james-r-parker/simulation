// Frame-interval and draw-time rings with their percentiles, and the measured refresh rate.

/** Frames kept for percentile reporting (about a minute at 60 fps). */
export const FRAME_RING_CAPACITY = 4096;

/**
 * Nearest-rank percentile of an ascending-sorted array.
 * @param {ArrayLike<number>} sortedValues Values sorted ascending.
 * @param {number} p Percentile in 0..100.
 * @returns {number} The percentile value, or 0 when empty.
 */
export function percentile(sortedValues, p) {
    const n = sortedValues.length;
    if (n === 0) {
        return 0;
    }
    const rank = Math.max(1, Math.ceil((p / 100) * n));
    return sortedValues[Math.min(rank, n) - 1];
}

/**
 * Fixed-capacity ring buffer of frame times that keeps the newest samples.
 * @param {number} [capacity] Maximum samples retained.
 * @returns {{ push: (ms: number) => void, values: () => Float64Array }} The ring.
 */
export function createFrameRing(capacity = FRAME_RING_CAPACITY) {
    const buffer = new Float64Array(capacity);
    let next = 0;
    let count = 0;
    return {
        push(ms) {
            buffer[next] = ms;
            next = (next + 1) % capacity;
            count = Math.min(count + 1, capacity);
        },
        values() {
            const out = new Float64Array(count);
            const start = count < capacity ? 0 : next;
            for (let i = 0; i < count; i++) {
                out[i] = buffer[(start + i) % capacity];
            }
            return out;
        },
    };
}

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
 * Empties both rings, so a measurement can start after the warm-up.
 * @param {FrameStats} stats the rings
 * @param {number} [capacity] samples each new ring keeps
 * @returns {void}
 */
export function clearFrameStats(stats, capacity) {
    stats.intervals = createFrameRing(capacity);
    stats.draws = createFrameRing(capacity);
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
