// Mean hunter count in the last complete season after burn-in.
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { BASIN_CHECKPOINT_TICKS } from './scene-basin.js';

/**
 * @param {ArrayLike<number>} counts hunter counts at consecutive checkpoints
 * @param {{firstTick: number, interval: number, lastTick: number, seasonTicks: number}} window sampling and season timing
 * @returns {import('./metrics-stats.js').MetricResult} the mean of all checkpoints in the season, including zeros
 */
export function terminalHunterCount(counts, { firstTick, interval, lastTick, seasonTicks }) {
    const end = Math.floor(lastTick / seasonTicks) * seasonTicks;
    const start = end - seasonTicks;
    if (!(seasonTicks > 0) || start < BURN_IN_TICKS) {
        return none('no complete season after burn-in');
    }
    const first = Math.ceil((start - firstTick) / interval);
    const stop = Math.ceil((end - firstTick) / interval);
    if (first < 0 || stop > counts.length || stop <= first) {
        return none('no complete season checkpoint series');
    }
    let sum = 0;
    for (let i = first; i < stop; i++) {
        sum += counts[i];
    }
    return ok(sum / (stop - first));
}

/**
 * @param {Record<string, any>} guards the existing post-burn-in checkpoint scene
 * @param {Record<string, any>} world the final world
 * @returns {import('./metrics-stats.js').MetricRecord} additive terminal hunter metric
 */
export function terminalHunterMetrics(guards, world) {
    const interval = BASIN_CHECKPOINT_TICKS;
    return {
        'eval.predators_at_end_terminal_window': terminalHunterCount(guards.log.hunters.subarray(0, guards.rows), {
            firstTick: Math.ceil(BURN_IN_TICKS / interval) * interval,
            interval,
            lastTick: world?.tick ?? 0,
            seasonTicks: guards.eraSeasonTicks,
        }),
    };
}
