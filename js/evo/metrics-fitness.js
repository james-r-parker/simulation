// Per-specialisation fitness metrics over the dead (the death log) and the living at the end.

import { metricName } from './metric-registry/index.js';
import { mean, none, ok, quantile } from './metrics-stats.js';

/** The percentile reported, as a fraction. */
export const P90 = 0.9;

/**
 * @param {Record<string, any>} observer the observer
 * @param {(observer: any, slot: number, config: any) => number} fitness the policy's fitness
 * @returns {number[][]} fitness values by spec index: deaths with a fitness (NaN ones skipped), then the living
 */
export function fitnessBySpec(observer, fitness) {
    /** @type {number[][]} */
    const bySpec = [];
    const add = (/** @type {number} */ spec, /** @type {number} */ value) => {
        if (!Number.isNaN(value)) {
            (bySpec[spec] ??= []).push(value);
        }
    };
    const { deaths } = observer;
    for (let i = 0; i < observer.deathCount; i++) {
        add(deaths.spec[i], deaths.fitness[i]);
    }
    for (const slot of observer.slotOf.values()) {
        add(observer.spec[slot], fitness(observer, slot, observer.config));
    }
    return bySpec;
}

/**
 * Metrics `eval.p90_fitness.<spec>` and `eval.mean_fitness.<spec>` for every specialisation, named by the config.
 * The 90th percentile interpolates linearly between order statistics (`quantile`).
 * @param {Record<string, any>} observer the observer
 * @param {((observer: any, slot: number, config: any) => number) | undefined} fitness the policy's fitness
 * @returns {import('./metrics-stats.js').MetricRecord} results keyed by metric name
 */
export function fitnessMetrics(observer, fitness) {
    /** @type {import('./metrics-stats.js').MetricRecord} */
    const out = {};
    const bySpec = fitness === undefined ? [] : fitnessBySpec(observer, fitness);
    for (const [name, spec] of Object.entries(observer.config.specialisations)) {
        const values = bySpec[/** @type {any} */ (spec).index] ?? [];
        const missing = fitness === undefined ? 'no fitness' : `no agents of ${name}`;
        out[metricName('eval.p90_fitness', name)] = values.length > 0 ? ok(quantile(values, P90)) : none(missing);
        out[metricName('eval.mean_fitness', name)] = values.length > 0 ? ok(mean(values)) : none(missing);
    }
    return out;
}
