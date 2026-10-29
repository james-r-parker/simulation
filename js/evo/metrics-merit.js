// The merit metrics (fitness-and-selection.md, New metrics, Phase 2): how much merit the living hold, whether females
// choose fathers of higher merit, how often the split gate blocks, and whether merit tracks the policy's fitness.
// Merit is read through `meritPeek`, never `meritNow`, so observing changes nothing in the world or its hash.
//
// `freeAgent` zeroes a dead slot's merit before the observer sees the death, so the pools keep a per-tick copy of
// `world.merit` and `world.meritStamp` (`snapshotMerit`) and read a death's merit from the copy: its merit as of the
// end of the previous tick, decayed to the death tick. All pools live in `observer.merit`, outside `observer.series`
// and the death log that the worker drains. With `meritEnabled` off nothing is allocated and every metric is `null`.

import { meritPeek } from '../sim/merit.js';
import { splitGatedShare } from '../sim/merit-tally.js';
import { SEX } from '../sim/sex.js';
import { createLog, ensureRoom } from './growable-log.js';
import { DIET_DIRECTIONS } from './metrics-diet.js';
import { none, ok, spearman } from './metrics-stats.js';
import { WATCHABILITY_DIRECTIONS } from './metrics-watchability.js';

/** Fewest mature deaths the merit-to-fitness correlation is computed from. */
export const MIN_CORRELATION_DEATHS = 30;

/** Most (merit, fitness) pairs kept for the correlation; later deaths are not added. */
export const MAX_PAIRS = 1 << 18;

/** The direction of each merit metric, and of the parent-diet and watchability metrics beside them, as the metrics table names them. */
export const MERIT_DIRECTIONS = Object.freeze({
    'eval.merit_mean': 'watch',
    'eval.merit_p90': 'watch',
    'eval.merit_mate_gain': 'higher',
    'eval.split_gated_share': 'watch',
    'eval.merit_fitness_corr': 'higher',
    ...DIET_DIRECTIONS,
    ...WATCHABILITY_DIRECTIONS,
});

const OFF = 'meritEnabled is off';
const NO_AGENTS = 'no checkpoint after burn-in with an alive agent';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} empty merit pools; with `meritEnabled` off only the flag is false and nothing is sized
 */
export function createMeritPools(config) {
    const enabled = config.meritEnabled === true;
    const n = enabled ? config.maxAgents : 0;
    return {
        enabled,
        // A stand-in for the world that `meritPeek` reads: the copied arrays, the config and the tick to decay to.
        view: { config, tick: 0, merit: new Float64Array(n), meritStamp: new Float64Array(n) },
        scratch: new Float64Array(n),
        meritSum: 0,
        meritCount: 0,
        p90Sum: 0,
        p90Count: 0,
        gainSum: 0,
        poolSum: 0,
        matings: 0,
        pairs: createLog(['merit', 'fitness']),
        pairCount: 0,
    };
}

/**
 * Copies the world's merit arrays, at the end of every observed tick, for the next tick's deaths.
 * @param {Record<string, any>} pools the merit pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function snapshotMerit(pools, world) {
    if (pools.enabled) {
        pools.view.merit.set(world.merit);
        pools.view.meritStamp.set(world.meritStamp);
    }
}

/**
 * Adds one checkpoint at or after burn-in: the alive agents' merit to the mean, and the checkpoint's 90th percentile.
 * @param {Record<string, any>} pools the merit pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleMerit(pools, world) {
    if (!pools.enabled) {
        return;
    }
    const { scratch } = pools;
    let n = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const merit = meritPeek(world, slot);
            scratch[n++] = merit;
            pools.meritSum += merit;
        }
    }
    if (n > 0) {
        const sorted = scratch.subarray(0, n).sort();
        const position = 0.9 * (n - 1);
        const low = Math.floor(position);
        const high = Math.min(low + 1, n - 1);
        pools.p90Sum += sorted[low] + (sorted[high] - sorted[low]) * (position - low);
        pools.p90Count += 1;
        pools.meritCount += n;
    }
}

/**
 * Pairs a mature death's merit with its fitness. The caller passes only deaths at or after burn-in and at or past
 * `maturityTicks`; a death without a fitness (NaN) is not paired.
 * @param {Record<string, any>} pools the merit pools
 * @param {{slot: number, tick: number, fitness: number}} death the dead slot, the death tick and the fitness logged
 * @returns {void}
 */
export function noteMeritDeath(pools, death) {
    if (!pools.enabled || Number.isNaN(death.fitness) || pools.pairCount >= MAX_PAIRS) {
        return;
    }
    pools.view.tick = death.tick;
    const row = pools.pairCount++;
    ensureRoom(pools.pairs, row);
    pools.pairs.merit[row] = meritPeek(pools.view, death.slot);
    pools.pairs.fitness[row] = death.fitness;
}

/**
 * Counts one mating birth at or after burn-in: the father's merit against the mean merit of the alive males of his
 * specialisation (himself included). Counts nothing when the father is no longer alive in his slot.
 * @param {Record<string, any>} pools the merit pools
 * @param {Record<string, any>} world the world
 * @param {number} child the child's slot
 * @param {number} fatherId the father's genome id (`parentB` of the child)
 * @returns {void}
 */
export function noteMateBirth(pools, world, child, fatherId) {
    const father = world.parentSlotB[child];
    if (!pools.enabled || !world.config.sexesEnabled || father < 0) {
        return;
    }
    if (world.alive[father] !== 1 || world.genomeId[father] !== fatherId) {
        return;
    }
    let sum = 0;
    let males = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.sex[slot] === SEX.MALE && world.spec[slot] === world.spec[father]) {
            sum += meritPeek(world, slot);
            males++;
        }
    }
    const pool = sum / males;
    pools.gainSum += meritPeek(world, father) - pool;
    pools.poolSum += pool;
    pools.matings += 1;
}

/**
 * @param {Record<string, any>} pools the merit pools
 * @returns {{mean: import('./metrics-stats.js').MetricResult, p90: import('./metrics-stats.js').MetricResult}} the mean
 *   of alive merit over all sampled agents, and the mean over checkpoints of each checkpoint's 90th percentile
 */
function meritLevel(pools) {
    if (!pools.enabled) {
        return { mean: none(OFF), p90: none(OFF) };
    }
    if (pools.meritCount === 0) {
        return { mean: none(NO_AGENTS), p90: none(NO_AGENTS) };
    }
    return { mean: ok(pools.meritSum / pools.meritCount), p90: ok(pools.p90Sum / pools.p90Count) };
}

/**
 * @param {Record<string, any>} pools the merit pools
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {import('./metrics-stats.js').MetricResult} the mean father advantage over the mean male merit
 */
function mateGain(pools, config) {
    if (!pools.enabled) {
        return none(OFF);
    }
    if (!config.sexesEnabled) {
        return none('sexesEnabled is off');
    }
    if (pools.matings === 0) {
        return none('no mating birth after burn-in with a living father');
    }
    return pools.poolSum > 0 ? ok(pools.gainSum / pools.poolSum) : none('no merit among the males');
}

/**
 * @param {Record<string, any>} pools the merit pools
 * @returns {import('./metrics-stats.js').MetricResult} Spearman correlation of merit and fitness at death
 */
function fitnessCorr(pools) {
    if (!pools.enabled) {
        return none(OFF);
    }
    if (pools.pairCount < MIN_CORRELATION_DEATHS) {
        return none(`fewer than ${MIN_CORRELATION_DEATHS} mature deaths with a fitness`);
    }
    const { merit, fitness } = pools.pairs;
    const r = spearman(merit.subarray(0, pools.pairCount), fitness.subarray(0, pools.pairCount));
    return Number.isNaN(r) ? none('merit or fitness is constant') : ok(r);
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed and fed every tick
 * @param {Record<string, any>} world the world at the end of the run (the gate tally lives on it)
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the five merit metrics, keyed by name; each
 *   `null` with a reason when `meritEnabled` is off or nothing could feed it
 */
export function meritMetrics(observer, world) {
    const pools = observer.merit;
    const level = meritLevel(pools);
    const gated = pools.enabled ? splitGatedShare(world) : null;
    return {
        'eval.merit_mean': level.mean,
        'eval.merit_p90': level.p90,
        'eval.merit_mate_gain': mateGain(pools, observer.config),
        'eval.split_gated_share':
            gated === null ? none(pools.enabled ? 'no agent was ready to split' : OFF) : ok(gated),
        'eval.merit_fitness_corr': fitnessCorr(pools),
    };
}
