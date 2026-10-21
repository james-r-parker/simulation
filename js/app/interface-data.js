// The charts' data for the current world: the sampler (which series, how a stats message becomes a row) and the
// history the rows go into. A new world gets a new sampler and an emptied history.

import { clearHistory, createHistory, pushSample } from './history.js';
import { createSampler } from './ui/chart-data.js';

/**
 * @typedef {object} ChartData
 * @property {import('./history.js').History} history the samples
 * @property {ReturnType<typeof createSampler>} sampler the series and the row builder
 */

/**
 * @returns {{ready: (ready: Record<string, any>) => ChartData, stats: (stats: Record<string, any>, nowMs: number) => void,
 *   data: () => ChartData | null}} `ready` starts the data for a world; `stats` adds a stats message; `data` is the
 *   current data, null before the first world
 */
export function createChartData() {
    /** @type {ChartData | null} */
    let current = null;
    return {
        data: () => current,
        ready(ready) {
            const sampler = createSampler({
                specs: ready.info.specs,
                bornCauses: ready.layout.bornCauses,
                deathCauses: ready.layout.deathCauses,
            });
            const history = current === null ? createHistory(sampler) : current.history;
            clearHistory(history);
            current = { history, sampler };
            return current;
        },
        stats(stats, nowMs) {
            if (current !== null) {
                const values = new Float64Array(current.sampler.names.length);
                current.sampler.fill(stats, values);
                pushSample(current.history, { nowMs, tick: stats.tick, values });
            }
        },
    };
}
