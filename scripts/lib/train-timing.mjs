// Time accounting of a training generation (docs/designs/training-loop.md, Phase 5): the pool's use of the episodes, the
// wall time of a step, and the `TrainTiming` record `npm run train:profile` reads (`scripts/lib/train-profile.mjs`).

/**
 * @param {Record<string, any>[]} results the generation's episode results
 * @param {{wallSeconds: number, workers: number}} timing the generation's wall time and the pool size
 * @returns {{ticks: number, cpuShare: number, busy: number}} ticks run, the share of the pool's time spent in episodes and
 *   the seconds the pool spent in them
 */
export function usage(results, { wallSeconds, workers }) {
    const busy = results.reduce((sum, r) => sum + r.wallMs, 0) / 1000;
    return {
        ticks: results.reduce((sum, r) => sum + r.ticks, 0),
        cpuShare: wallSeconds === 0 ? 0 : busy / (wallSeconds * workers),
        busy,
    };
}

/**
 * @template T
 * @param {() => Promise<T>} step an async step
 * @returns {Promise<{value: T, seconds: number}>} its result and the wall seconds it took
 */
export async function timed(step) {
    const start = performance.now();
    const value = await step();
    return { value, seconds: (performance.now() - start) / 1000 };
}

/**
 * Logs the generation's `TrainTiming` record.
 * @param {import('../../js/sim/log.js').SimLog} log the log
 * @param {{generation: number, stage: string, workers: number, busySeconds: number, episodeSeconds: number, checkpointSeconds: number, saveSeconds: number}} fields
 *   the generation, its stage, the pool size, the pool's seconds inside episodes and the wall seconds of each phase
 * @returns {void}
 */
export function logTiming(log, fields) {
    log.log('info', 'TrainTiming', fields);
}
