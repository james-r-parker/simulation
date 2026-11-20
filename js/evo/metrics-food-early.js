// Food intake over the run's first ticks, read from the checkpoint series: the cumulative food energy and agent-ticks
// each checkpoint records, so a trained founder set is judged on how fast it feeds before the world has drifted.

import { per1k, none } from './metrics-stats.js';

/** `eval.food_energy_per_1k@20k` reads the run up to this tick. */
export const EARLY_TICKS = 20000;

/**
 * @param {Record<string, any>} observer the observer
 * @returns {number} food energy eaten so far, by the dead plus the living
 */
export function foodEnergyTotal(observer) {
    let total = observer.foodEnergyDead;
    for (const slot of observer.slotOf.values()) {
        total += observer.foodEnergy[slot];
    }
    return total;
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed during the run
 * @returns {import('./metrics-stats.js').MetricResult} the food energy per 1000 agent-ticks up to the last checkpoint
 *   at or before `EARLY_TICKS`, or `null` with a reason when there is none
 */
export function foodEnergyEarly(observer) {
    const { series, checkpointCount } = observer;
    let last = -1;
    for (let i = 0; i < checkpointCount && series.tick[i] <= EARLY_TICKS; i++) {
        last = i;
    }
    if (last < 0) {
        return none(`no checkpoint by tick ${EARLY_TICKS}`);
    }
    return per1k(series.foodEnergyTotal[last], series.agentTicksTotal[last]);
}
