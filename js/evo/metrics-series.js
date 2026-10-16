// Metrics read from the observer's checkpoint series: population, diversity, lineages and dominance turnover.

import { BURN_IN_TICKS } from './observer-events.js';
import { mean, none, ok, stddev } from './metrics-stats.js';

export { BURN_IN_TICKS };
/** A newly dominant lineage must be absent from this many previous checkpoints to count as turnover. */
export const TURNOVER_WINDOW = 10;
/** Turnover is reported per this many ticks after burn-in. */
export const TURNOVER_PER_TICKS = 100000;

/**
 * @param {Record<string, any>} observer the observer
 * @param {string} column a series column
 * @param {(tick: number) => boolean} [keep] which checkpoints to read, by tick; all when omitted
 * @returns {number[]} the non-NaN values of the column at the kept checkpoints
 */
function columnValues(observer, column, keep = () => true) {
    const { series, checkpointCount } = observer;
    /** @type {number[]} */
    const values = [];
    for (let i = 0; i < checkpointCount; i++) {
        const v = series[column][i];
        if (keep(series.tick[i]) && !Number.isNaN(v)) {
            values.push(v);
        }
    }
    return values;
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the mean population over checkpoints
 */
export function populationMean(observer) {
    const values = columnValues(observer, 'population');
    return values.length > 0 ? ok(mean(values)) : none('no checkpoint');
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the mean of the checkpoints' diversity, NaN ones skipped
 */
export function diversity(observer) {
    const values = columnValues(observer, 'diversity');
    return values.length > 0 ? ok(mean(values)) : none('no checkpoint with 2 agents');
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the mean lineages alive at checkpoints after burn-in
 */
export function lineagesAlive(observer) {
    const values = columnValues(observer, 'lineagesAlive', (tick) => tick >= BURN_IN_TICKS);
    return values.length > 0 ? ok(mean(values)) : none('no checkpoint after burn-in');
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the standard deviation of the predator share over its mean
 */
export function predatorShareCv(observer) {
    const values = columnValues(observer, 'predatorShare');
    if (values.length === 0) {
        return none('no checkpoint');
    }
    const m = mean(values);
    return m > 0 ? ok(stddev(values) / m) : none('mean predator share is 0');
}

/**
 * Checkpoints at or after burn-in whose dominant lineage is non-zero and differs from the dominant lineage of each of
 * the previous `TURNOVER_WINDOW` checkpoints (burn-in checkpoints included), scaled to `TURNOVER_PER_TICKS` ticks by
 * the run length after burn-in, `observer.ticks - BURN_IN_TICKS`.
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the turnover rate
 */
export function lineageTurnover(observer) {
    const { series, checkpointCount } = observer;
    const span = observer.ticks - BURN_IN_TICKS;
    let after = 0;
    let turnovers = 0;
    for (let i = 0; i < checkpointCount; i++) {
        if (series.tick[i] < BURN_IN_TICKS) {
            continue;
        }
        after++;
        const dominant = series.dominantLineage[i];
        let fresh = dominant !== 0;
        for (let j = Math.max(0, i - TURNOVER_WINDOW); j < i && fresh; j++) {
            fresh = series.dominantLineage[j] !== dominant;
        }
        turnovers += fresh ? 1 : 0;
    }
    if (after === 0) {
        return none('no checkpoint after burn-in');
    }
    return span > 0 ? ok((turnovers * TURNOVER_PER_TICKS) / span) : none('no ticks after burn-in');
}
