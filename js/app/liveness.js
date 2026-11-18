// Read-only app liveness counters shared with the browser smoke and devtools.

import { gpuCounts, installPerf } from './perf.js';
import { fxPerf } from './fx-dev.js';
import { skippedPacks } from './pack/frame-slots.js';

/**
 * @param {{readFrames: () => number, readTick: () => number, resetFrames: () => void}} readers live app readers
 * @returns {{readonly frames: number, readonly tick: number, resetFrames: () => void}} a small liveness surface
 */
export function createAppLiveness({ readFrames, readTick, resetFrames }) {
    return Object.freeze({
        get frames() {
            return readFrames();
        },
        get tick() {
            return readTick();
        },
        resetFrames,
    });
}

/**
 * @param {import('./pack/frame-slots.js').FrameSlots | null} slots the pack worker's frame slots
 * @returns {number} the requests the worker skipped, 0 before a world
 */
function packSkipped(slots) {
    return slots === null ? 0 : skippedPacks(slots);
}

/** @param {any} app the live app @returns {import('./perf.js').PerfInputs} the current perf inputs */
export function readAppPerf(app) {
    return {
        stats: app.stats,
        worker: app.supervisor.client()?.stats ?? null,
        gpu: gpuCounts(app.deps.scene?.renderer.info),
        gpuSamples: app.deps.gpuTimer?.samples() ?? null,
        heapBytes: /** @type {any} */ (performance).memory?.usedJSHeapSize ?? null,
        lateFrames: app.loop.lateFrames(),
        skippedPacks: packSkipped(app.pack.slots()),
        ...fxPerf(app),
    };
}

/**
 * @param {{target: {__perf?: (() => object) & {reset?: () => void}}, production: boolean, read: () => import('./perf.js').PerfInputs,
 *   reset: () => void}} options reporting target and live app readers
 * @returns {void}
 */
export function startReporting({ target, production, read, reset }) {
    if (!production) {
        installPerf(target, { read, reset });
    }
}
