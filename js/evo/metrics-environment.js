// The environment metrics (fitness-and-selection.md, New metrics): how much of the population sits in temperature
// stress, how many deaths are collisions with walls or obstacles, and how well the population holds up in winter.
// `sampleEnvironment` runs once per checkpoint at or after burn-in and `noteDeath` once per death; both add to
// run-long sums in `observer.environment` (outside `observer.series`, which the worker drains) that the metrics
// read at report time. Nothing here runs per tick or allocates.

import { DEATH_CAUSE } from '../sim/events.js';
import { WINTER } from '../sim/eras.js';
import { none, ok } from './metrics-stats.js';

const NO_AGENTS = 'no checkpoint after burn-in with an alive agent';
const NO_DEATHS = 'no death after burn-in';
const NO_WINTER = 'no winter checkpoint after burn-in';
const NO_OTHER = 'no non-winter checkpoint after burn-in with an alive agent';

/**
 * @returns {{agents: number, cold: number, heat: number, deaths: number, collisions: number, winterSum: number,
 *   winterCount: number, otherSum: number, otherCount: number}} empty environment pools: alive agents sampled and
 *   those below the cold and above the heat threshold, deaths and collision deaths, and the summed population and
 *   count of winter and of other checkpoints
 */
export function createEnvironmentPools() {
    return {
        agents: 0,
        cold: 0,
        heat: 0,
        deaths: 0,
        collisions: 0,
        winterSum: 0,
        winterCount: 0,
        otherSum: 0,
        otherCount: 0,
    };
}

/**
 * Adds one checkpoint to the environment pools: each alive agent's temperature against the two stress thresholds,
 * and the alive count to the winter or the other sum by `world.season[0]` (the seasons last `eraSeasonTicks`).
 * @param {ReturnType<typeof createEnvironmentPools>} pools the pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleEnvironment(pools, world) {
    const { temperatureColdStress: cold, temperatureHeatStress: heat } = world.config;
    const { temperature, alive } = world;
    let n = 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            n++;
            pools.cold += temperature[slot] < cold ? 1 : 0;
            pools.heat += temperature[slot] > heat ? 1 : 0;
        }
    }
    pools.agents += n;
    if (world.season[0] === WINTER) {
        pools.winterSum += n;
        pools.winterCount++;
    } else {
        pools.otherSum += n;
        pools.otherCount++;
    }
}

/**
 * Counts one death at or after burn-in.
 * @param {ReturnType<typeof createEnvironmentPools>} pools the pools
 * @param {number} cause a `DEATH_CAUSE` code
 * @returns {void}
 */
export function noteDeath(pools, cause) {
    pools.deaths++;
    pools.collisions += cause === DEATH_CAUSE.COLLISION ? 1 : 0;
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed during the run
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four environment metrics, keyed by name;
 *   each `null` with a reason when nothing at or after burn-in could feed it
 */
export function environmentMetrics(observer) {
    const p = observer.environment;
    const share = (/** @type {number} */ n, /** @type {number} */ of, /** @type {string} */ reason) =>
        of === 0 ? none(reason) : ok(n / of);
    return {
        'eval.cold_stress_share': share(p.cold, p.agents, NO_AGENTS),
        'eval.heat_stress_share': share(p.heat, p.agents, NO_AGENTS),
        'eval.terrain_death_share': share(p.collisions, p.deaths, NO_DEATHS),
        'eval.winter_pop_ratio': winterRatio(p),
    };
}

/**
 * @param {ReturnType<typeof createEnvironmentPools>} p the pools
 * @returns {import('./metrics-stats.js').MetricResult} the mean winter population over the mean of the others
 */
function winterRatio(p) {
    if (p.winterCount === 0) {
        return none(NO_WINTER);
    }
    if (p.otherCount === 0 || p.otherSum === 0) {
        return none(NO_OTHER);
    }
    return ok(p.winterSum / p.winterCount / (p.otherSum / p.otherCount));
}
