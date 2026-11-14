// GPU frame time from three's resolved timestamp queries (`trackTimestamp`): one resolve in flight at a time; its summed
// milliseconds are divided by the frames drawn since the previous resolve. A renderer without timestamps (not asked
// for, or no `timestamp-query` feature) resolves `undefined`, and nothing is recorded.

import { createFrameRing } from './frame-stats.js';

/**
 * @param {{resolveTimestampsAsync: (type?: string) => Promise<number | undefined>}} renderer the renderer
 * @param {number} [capacity] results the ring keeps
 * @returns {{begin: () => void, end: () => void, poll: () => void, samples: () => Float64Array, latest: () => number,
 *   reset: () => void}} the timer: `end` counts a drawn frame, `poll` starts a resolve when none is in flight,
 *   `samples` is the per-frame times in ms, `latest` the newest (-1 before one) and `reset` forgets them
 */
export function createGpuTime(renderer, capacity) {
    let ring = createFrameRing(capacity);
    let frames = 0;
    let inFlight = false;
    let last = -1;
    const settle = (/** @type {number | undefined} */ ms, /** @type {number} */ counted) => {
        inFlight = false;
        if (typeof ms === 'number' && Number.isFinite(ms) && counted > 0) {
            last = ms / counted;
            ring.push(last);
        }
    };
    return {
        begin() {},
        end() {
            frames++;
        },
        poll() {
            if (inFlight || frames === 0) {
                return;
            }
            inFlight = true;
            const counted = frames;
            frames = 0;
            renderer.resolveTimestampsAsync('render').then(
                (ms) => settle(ms, counted),
                () => settle(undefined, 0),
            );
        },
        samples: () => ring.values(),
        latest: () => last,
        reset() {
            ring = createFrameRing(capacity);
        },
    };
}

/**
 * @param {{renderer: any} | null} stage the stage, null before it exists
 * @returns {ReturnType<typeof createGpuTime> | null} a timer on its renderer, null without a stage
 */
export function gpuTimeFor(stage) {
    return stage === null ? null : createGpuTime(stage.renderer);
}
