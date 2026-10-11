// Dev-only frame-time probe: exposes window.__perf() for the browser baseline script.

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

/**
 * @param {number} x Value to round.
 * @returns {number} x rounded to 2 decimal places.
 */
function round2(x) {
    return Math.round(x * 100) / 100;
}

/**
 * Build the payload returned by window.__perf().
 * @param {{ values: () => Float64Array }} ring Frame time ring.
 * @param {{ getReport: () => { phases: object } }} monitor Performance monitor.
 * @returns {{ app: string, frameMs: { p50: number, p95: number, p99: number }, frames: number, phases: object }} Payload.
 */
export function buildPerfPayload(ring, monitor) {
    const sorted = ring.values().sort();
    return {
        app: 'legacy',
        frameMs: {
            p50: round2(percentile(sorted, 50)),
            p95: round2(percentile(sorted, 95)),
            p99: round2(percentile(sorted, 99)),
        },
        frames: sorted.length,
        phases: monitor.getReport().phases,
    };
}

/**
 * Record every finished frame into a ring and expose `__perf` on the target.
 * @param {{ __perf?: () => object }} target Object to receive `__perf` (the window).
 * @param {{ timings: { frame: number[] }, endFrame: () => void, getReport: () => { phases: object } }} monitor Monitor to wrap.
 * @returns {void}
 */
export function installPerfProbe(target, monitor) {
    const ring = createFrameRing(FRAME_RING_CAPACITY);
    const originalEndFrame = monitor.endFrame;
    monitor.endFrame = function endFrameWithProbe(...args) {
        const result = originalEndFrame.apply(this, args);
        const frames = this.timings.frame;
        if (frames.length > 0) {
            ring.push(frames[frames.length - 1]);
        }
        return result;
    };
    target.__perf = () => buildPerfPayload(ring, monitor);
}
