// The memory-output life statistics (brain-capacity-and-memory.md, Metrics): does a life's `MEMORY_A` and `MEMORY_B`
// output carry a signal that persists, or sit flat, or flicker? Every `MEMORY_SAMPLE_TICKS` ticks each alive agent adds
// its two memory outputs to per-slot sums (count, first, last, sum, sum of squares, sum of lag-1 products), reset on
// slot reuse. At death a life of at least `MIN_LIFE_TICKS` ticks is classified from them. All `watch`.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { none, share } from './metrics-stats.js';

/** Ticks between samples. */
export const MEMORY_SAMPLE_TICKS = 4;

/** A life shorter than this is not classified. */
export const MIN_LIFE_TICKS = 600;

/** An output with a standard deviation under this is flat. */
export const FLAT_SD = 0.05;

/** A varying output with a lag-1 autocorrelation under this carries no state. */
export const NOISY_R1 = 0.2;

/** The metrics need at least this many classified lives. */
export const MIN_LIVES = 100;

/** The class of a life. */
export const LIFE_CLASS = Object.freeze({ FLAT: 0, NOISY: 1, SIGNAL: 2 });

/** The direction of each metric here. */
export const MEMORY_OUT_DIRECTIONS = Object.freeze({
    'eval.memory_out_flat_share': 'watch',
    'eval.memory_out_noisy_share': 'watch',
    'eval.memory_out_signal_share': 'watch',
});

const OUTPUTS = 2;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} the per-slot sums (two outputs per slot) and the pooled class counts, all zero
 */
export function createMemoryOutPools(config) {
    const n = config.maxAgents;
    return {
        count: new Uint32Array(n),
        first: new Float64Array(n * OUTPUTS),
        last: new Float64Array(n * OUTPUTS),
        sum: new Float64Array(n * OUTPUTS),
        squares: new Float64Array(n * OUTPUTS),
        lagged: new Float64Array(n * OUTPUTS),
        lives: 0,
        classes: new Float64Array(3),
    };
}

/**
 * Clears a slot's sums, for a newborn or a reused slot.
 * @param {Record<string, any>} pools the memory-output pools
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetMemoryOutSlot(pools, slot) {
    pools.count[slot] = 0;
    for (let k = slot * OUTPUTS; k < (slot + 1) * OUTPUTS; k++) {
        pools.first[k] = 0;
        pools.last[k] = 0;
        pools.sum[k] = 0;
        pools.squares[k] = 0;
        pools.lagged[k] = 0;
    }
}

/**
 * Adds every alive agent's two memory outputs to its sums when the tick is a sample tick.
 * @param {Record<string, any>} pools the memory-output pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleMemoryOut(pools, world) {
    if (world.tick % MEMORY_SAMPLE_TICKS !== 0) {
        return;
    }
    const { alive, outputs, layout } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        const seen = pools.count[slot];
        for (let o = 0; o < OUTPUTS; o++) {
            const x = outputs[slot * layout.outputCount + OUTPUT_INDEX.MEMORY_A + o];
            const k = slot * OUTPUTS + o;
            if (seen === 0) {
                pools.first[k] = x;
            } else {
                pools.lagged[k] += x * pools.last[k];
            }
            pools.last[k] = x;
            pools.sum[k] += x;
            pools.squares[k] += x * x;
        }
        pools.count[slot] = seen + 1;
    }
}

/**
 * @param {Record<string, any>} pools the memory-output pools
 * @param {number} k the slot-and-output index
 * @param {number} n the samples
 * @returns {{sd: number, r1: number}} the output's standard deviation and its lag-1 autocorrelation (the Pearson
 *   correlation of the `n - 1` consecutive pairs; 0 when either side has no variance)
 */
export function outputStats(pools, k, n) {
    const mean = pools.sum[k] / n;
    const sd = Math.sqrt(Math.max(0, pools.squares[k] / n - mean * mean));
    const prev = n - 1;
    const meanPrev = (pools.sum[k] - pools.last[k]) / prev;
    const meanNext = (pools.sum[k] - pools.first[k]) / prev;
    const varPrev = (pools.squares[k] - pools.last[k] * pools.last[k]) / prev - meanPrev * meanPrev;
    const varNext = (pools.squares[k] - pools.first[k] * pools.first[k]) / prev - meanNext * meanNext;
    const cov = pools.lagged[k] / prev - meanPrev * meanNext;
    const r1 = varPrev > 1e-12 && varNext > 1e-12 ? cov / Math.sqrt(varPrev * varNext) : 0;
    return { sd, r1 };
}

/**
 * Classifies a life: flat when both outputs have a standard deviation under `FLAT_SD`; otherwise a signal when some
 * varying output has a lag-1 autocorrelation of at least `NOISY_R1`, else noisy.
 * @param {Record<string, any>} pools the memory-output pools
 * @param {number} slot the slot, with at least 3 samples
 * @returns {number} a `LIFE_CLASS`
 */
export function classifyLife(pools, slot) {
    const n = pools.count[slot];
    let varies = false;
    for (let o = 0; o < OUTPUTS; o++) {
        const { sd, r1 } = outputStats(pools, slot * OUTPUTS + o, n);
        if (sd >= FLAT_SD) {
            varies = true;
            if (r1 >= NOISY_R1) {
                return LIFE_CLASS.SIGNAL;
            }
        }
    }
    return varies ? LIFE_CLASS.NOISY : LIFE_CLASS.FLAT;
}

/**
 * Classifies a dying life of at least `MIN_LIFE_TICKS` ticks and adds it to the pooled counts. Call for deaths at or
 * after burn-in, before the slot is reset.
 * @param {Record<string, any>} pools the memory-output pools
 * @param {number} slot the dying agent's slot
 * @param {number} ageTicks its age at death
 * @returns {void}
 */
export function noteMemoryOutDeath(pools, slot, ageTicks) {
    if (ageTicks < MIN_LIFE_TICKS || pools.count[slot] < 3) {
        return;
    }
    pools.classes[classifyLife(pools, slot)] += 1;
    pools.lives += 1;
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three metrics
 */
export function memoryOutMetrics(observer) {
    const { lives, classes } = observer.memoryOut;
    const few = `fewer than ${MIN_LIVES} lives of at least ${MIN_LIFE_TICKS} ticks`;
    const of = (/** @type {number} */ k) => (lives >= MIN_LIVES ? share(classes[k], lives, few) : none(few));
    return {
        'eval.memory_out_flat_share': of(LIFE_CLASS.FLAT),
        'eval.memory_out_noisy_share': of(LIFE_CLASS.NOISY),
        'eval.memory_out_signal_share': of(LIFE_CLASS.SIGNAL),
    };
}
