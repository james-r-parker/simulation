// The eval metrics: one pass over the observer's state at the end of a run. Pure given the observer and its rng
// state; the only draws are the behaviour-grid sample, taken from `observer.rng`.

import { BORN_CAUSE, DEATH_CAUSE } from '../sim/events.js';
import { fitnessMetrics } from './metrics-fitness.js';
import { behaviourCoverage } from './metrics-grids.js';
import * as series from './metrics-series.js';
import { none, ok, per1k, quantile } from './metrics-stats.js';

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} food energy eaten, dead plus living, per 1000 agent-ticks
 */
function foodEnergyPer1k(observer) {
    let total = observer.foodEnergyDead;
    for (const slot of observer.slotOf.values()) {
        total += observer.foodEnergy[slot];
    }
    return per1k(total, observer.agentTicks);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the median `ageTicks` of deaths at or past `maturityTicks`
 */
function medianLifespan(observer) {
    /** @type {number[]} */
    const ages = [];
    for (let i = 0; i < observer.deathCount; i++) {
        if (observer.deaths.ageTicks[i] >= observer.config.maturityTicks) {
            ages.push(observer.deaths.ageTicks[i]);
        }
    }
    return ages.length > 0 ? ok(quantile(ages, 0.5)) : none('no mature death');
}

/**
 * Computes every Phase 1 metric from the observer after the run. `bench.*` and `browser.*` are not here.
 * @param {Record<string, any>} observer the observer, fed every tick and checkpointed
 * @param {Record<string, any>} _world the world at the end (the observer already holds what the metrics need)
 * @param {{fitness?: (observer: any, slot: number, config: any) => number, fitnessName?: string}} [options] the
 *   policy's fitness; without it the fitness metrics are `null` with reason `no fitness`
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} results keyed by metric name, in sorted order
 */
export function computeMetrics(observer, _world, options = {}) {
    const grids = behaviourCoverage(observer);
    const { births, deathsByCause, agentTicks } = observer;
    /** @type {Record<string, import('./metrics-stats.js').MetricResult>} */
    const all = {
        'eval.food_energy_per_1k': foodEnergyPer1k(observer),
        'eval.median_lifespan': medianLifespan(observer),
        'eval.births_per_1k': per1k(births[BORN_CAUSE.MATE] + births[BORN_CAUSE.SPLIT], agentTicks),
        'eval.population_mean': series.populationMean(observer),
        'eval.floor_episodes': ok(observer.floorEpisodes),
        'eval.predation_per_1k': per1k(deathsByCause[DEATH_CAUSE.EATEN], agentTicks),
        'eval.diversity': series.diversity(observer),
        'eval.lineages_alive': series.lineagesAlive(observer),
        'eval.lineage_turnover': series.lineageTurnover(observer),
        'eval.behaviour_coverage': grids.life,
        'eval.motion_coverage': grids.motion,
        'eval.predator_share_cv': series.predatorShareCv(observer),
        ...fitnessMetrics(observer, options.fitness),
        'eval.qd_score': none('no archive'),
        'eval.coverage': none('no archive'),
        'eval.champion_elo': none('no league games'),
        'eval.champion_win_rate': none('no league games'),
    };
    return Object.fromEntries(
        Object.keys(all)
            .sort()
            .map((key) => [key, all[key]]),
    );
}
