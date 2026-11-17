// Read-only app liveness counters shared with the browser smoke and devtools.

import { gpuCounts, installPerf } from './perf.js';
import { fxPerf } from './fx-dev.js';

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

/** @param {any} app the live app @returns {import('./perf.js').PerfInputs} the current perf inputs */
export function readAppPerf(app) {
    return {
        stats: app.stats,
        worker: app.supervisor.client()?.stats ?? null,
        gpu: gpuCounts(app.deps.scene?.renderer.info),
        gpuSamples: app.deps.gpuTimer?.samples() ?? null,
        heapBytes: /** @type {any} */ (performance).memory?.usedJSHeapSize ?? null,
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
