// `window.__perf()`: the frame, draw and GPU times, the refresh rate and the renderer's counts, for the browser perf
// script and for a person at the devtools console. Pure over what it is given; the page supplies the live values.

import { frameReport, spread } from './frame-stats.js';

/**
 * @param {Float64Array} samples unsorted times in ms
 * @returns {{p50: number, p95: number, p99: number} | null} their percentiles to 2 decimals, null with no samples; the
 *   caller's array is not reordered
 */
export function spreadOf(samples) {
    return samples.length === 0 ? null : spread(samples.slice());
}

/**
 * @typedef {object} PerfInputs
 * @property {import('./frame-stats.js').FrameStats} stats the frame and draw rings
 * @property {{tick: number, ticksPerSecond: number, droppedTicks: number, population: number} | null} worker the newest stats message
 * @property {{geometries: number, textures: number, programs: number}} gpu `renderer.info` counts
 * @property {Float64Array | null} gpuSamples finished GPU frame times in ms, null without the timer query
 * @property {number | null} heapBytes `performance.memory.usedJSHeapSize`, null when the browser has none
 */

/**
 * @param {PerfInputs} inputs the live values
 * @returns {{app: 'v6', refreshHz: number, frameMs: {p50: number, p95: number, p99: number}, drawMs: {p50: number,
 *   p95: number, p99: number}, gpuMs: {p50: number, p95: number, p99: number} | null, frames: number,
 *   agents: number, ticksPerSecond: number, droppedTicks: number, heapMb: number | null, gpu: {geometries: number, textures: number,
 *   programs: number}}} the payload
 */
export function buildPerf({ stats, worker, gpu, gpuSamples, heapBytes }) {
    const report = frameReport(stats);
    return {
        app: 'v6',
        refreshHz: report.refreshHz,
        frameMs: report.frameMs,
        drawMs: report.drawMs,
        gpuMs: gpuSamples === null ? null : spreadOf(gpuSamples),
        frames: report.frames,
        agents: worker?.population ?? 0,
        ticksPerSecond: worker?.ticksPerSecond ?? 0,
        droppedTicks: worker?.droppedTicks ?? 0,
        heapMb: heapBytes === null ? null : Math.round((heapBytes / 1048576) * 10) / 10,
        gpu: { geometries: gpu.geometries, textures: gpu.textures, programs: gpu.programs },
    };
}

/**
 * Exposes `__perf` on a target, in development builds only (the caller decides). `__perf.reset()` forgets the frames
 * recorded so far, so a script can measure after the warm-up.
 * @param {{__perf?: (() => object) & {reset?: () => void}}} target the window
 * @param {{read: () => PerfInputs, reset: () => void}} hooks reads the live values; forgets the recorded frames
 * @returns {void}
 */
export function installPerf(target, { read, reset }) {
    const perf = () => buildPerf(read());
    perf.reset = reset;
    target.__perf = perf;
}
