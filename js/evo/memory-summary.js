// The `MemorySummary` log record: once per checkpoint at or after burn-in, the running leak, hidden-state, Hebbian
// drift, clamp and step-size figures, so a run's log shows them drift without a report. Read-only on the observer.

import { BURN_IN_TICKS } from './burn-in.js';
import { brainMetrics } from './metrics-brain.js';

/** The metrics a summary carries, by field name. */
const FIELDS = Object.freeze({
    leakRateMean: 'eval.leak_rate_mean',
    leakSlowShare: 'eval.leak_slow_share',
    leakAtFloorShare: 'eval.leak_at_floor_share',
    hiddenPersistence: 'eval.hidden_persistence',
    hebbDrift: 'eval.hebb_drift',
    hebbDriftClampedShare: 'eval.hebb_drift_clamped_share',
    weightClampShare: 'eval.weight_clamp_share',
    sigmaMean: 'eval.sigma_mean',
});

/**
 * @param {Record<string, any>} observer the observer
 * @param {number} tick the checkpoint's tick
 * @returns {Record<string, number | null>} `tick` and each figure (`null` where its metric is)
 */
export function memorySummaryFields(observer, tick) {
    const metrics = brainMetrics(observer);
    /** @type {Record<string, number | null>} */
    const fields = { tick };
    for (const [field, name] of Object.entries(FIELDS)) {
        fields[field] = metrics[name].value;
    }
    return fields;
}

/**
 * Logs a `MemorySummary` (debug) when the checkpoint is at or after burn-in.
 * @param {import('../sim/log.js').SimLog} log the log
 * @param {Record<string, any>} observer the observer
 * @param {{tick: number}} world the world
 * @returns {void}
 */
export function logMemorySummary(log, observer, world) {
    if (log.level === 'debug' && world.tick >= BURN_IN_TICKS) {
        log.log('debug', 'MemorySummary', memorySummaryFields(observer, world.tick));
    }
}
