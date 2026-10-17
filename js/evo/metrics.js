// The eval metrics: one pass over the observer's state at the end of a run. Pure given the observer and its rng
// state; the only draws are the behaviour-grid sample, taken from `observer.rng`.

import { BORN_CAUSE, DEATH_CAUSE } from '../sim/events.js';
import { coverage, qdScore } from './archive.js';
import { combatMetrics } from './metrics-combat.js';
import { fitnessMetrics } from './metrics-fitness.js';
import { behaviourCoverage } from './metrics-grids.js';
import { intentMetrics } from './metrics-intent.js';
import { selectionMetrics } from './metrics-selection.js';
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
    return matureLifespan(observer, 0, 'no mature death');
}

/**
 * Median age at death of mature agents that ate at least one food item's worth (`config.foodEnergy`), so agents that
 * live long by not moving do not count.
 * @param {Record<string, any>} observer the observer
 * @returns {{ value: number | null, reason?: string }}
 */
function fedMedianLifespan(observer) {
    return matureLifespan(observer, observer.config.foodEnergy, 'no mature death after a meal');
}

/**
 * @param {Record<string, any>} observer the observer
 * @param {number} minFood the least food energy a death needs to count
 * @param {string} reason the null reason when none counts
 * @returns {{ value: number | null, reason?: string }} the median age at death of the mature deaths that count
 */
function matureLifespan(observer, minFood, reason) {
    /** @type {number[]} */
    const ages = [];
    const { deaths, deathCount, config } = observer;
    for (let i = 0; i < deathCount; i++) {
        if (deaths.ageTicks[i] >= config.maturityTicks && deaths.foodEnergy[i] >= minFood) {
            ages.push(deaths.ageTicks[i]);
        }
    }
    return ages.length > 0 ? ok(quantile(ages, 0.5)) : none(reason);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} agents that entered by a mating or split, over all agents that
 *   entered (mating, split, initial, floor, immigrant), counting entries at or after `BURN_IN_TICKS`
 */
function bornShare(observer) {
    const entries = observer.birthsAfterBurnIn;
    let total = 0;
    for (let cause = 0; cause < entries.length; cause++) {
        total += entries[cause];
    }
    if (total === 0) {
        return none('no agent entered after burn-in');
    }
    return ok((entries[BORN_CAUSE.MATE] + entries[BORN_CAUSE.SPLIT]) / total);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} births with cause `mate` over births with cause `mate` or
 *   `split`, over the whole run; `null` when there was no such birth
 */
function matingShare(observer) {
    const mate = observer.births[BORN_CAUSE.MATE];
    const total = mate + observer.births[BORN_CAUSE.SPLIT];
    return total === 0 ? none('no mating or split birth') : ok(mate / total);
}

/**
 * Computes every metric from the observer after the run. `bench.*` and `browser.*` are not here.
 * @param {Record<string, any>} observer the observer, fed every tick and checkpointed
 * @param {Record<string, any>} _world the world at the end (the observer already holds what the metrics need)
 * @param {{fitness?: (observer: any, slot: number, config: any) => number, fitnessName?: string, archive?: any}} [options]
 *   the policy's fitness (without it the fitness metrics are `null` with reason `no fitness`) and its archive
 *   (without it `eval.qd_score` and `eval.coverage` are `null` with reason `no archive`)
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} results keyed by metric name, in sorted order
 */
export function computeMetrics(observer, _world, options = {}) {
    const grids = behaviourCoverage(observer);
    const { archive } = options;
    const { births, deathsByCause, agentTicks } = observer;
    /** @type {Record<string, import('./metrics-stats.js').MetricResult>} */
    const all = {
        'eval.food_energy_per_1k': foodEnergyPer1k(observer),
        'eval.median_lifespan': medianLifespan(observer),
        'eval.fed_median_lifespan': fedMedianLifespan(observer),
        'eval.births_per_1k': per1k(births[BORN_CAUSE.MATE] + births[BORN_CAUSE.SPLIT], agentTicks),
        'eval.population_mean': series.populationMean(observer),
        'eval.floor_episodes': ok(observer.floorEpisodes),
        'eval.born_share': bornShare(observer),
        'eval.mating_share': matingShare(observer),
        'eval.predation_per_1k': per1k(deathsByCause[DEATH_CAUSE.EATEN], agentTicks),
        'eval.diversity': series.diversity(observer),
        'eval.lineages_alive': series.lineagesAlive(observer),
        'eval.lineage_turnover': series.lineageTurnover(observer),
        'eval.behaviour_coverage': grids.life,
        'eval.motion_coverage': grids.motion,
        'eval.predator_share_cv': series.predatorShareCv(observer),
        ...combatMetrics(observer),
        ...intentMetrics(observer),
        ...selectionMetrics(observer),
        ...fitnessMetrics(observer, options.fitness),
        'eval.qd_score': archive === undefined ? none('no archive') : ok(qdScore(archive)),
        'eval.coverage': archive === undefined ? none('no archive') : ok(coverage(archive)),
        'eval.champion_elo': none('no league games'),
        'eval.champion_win_rate': none('no league games'),
    };
    return Object.fromEntries(
        Object.keys(all)
            .sort()
            .map((key) => [key, all[key]]),
    );
}
