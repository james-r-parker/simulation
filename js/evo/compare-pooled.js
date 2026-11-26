// The comparison of a pooled metric (docs/designs/metric-noise.md, Phase 2): each arm's estimate is the ratio of the
// sums of its seeds' numerators and denominators, and the interval resamples whole seeds (the same seed in both arms,
// as `compare.js` pairs them) and recomputes both ratios, so the seed is the unit that varies and an event is never an
// independent draw. The interval is the studentised one in `pooled-t.js` at every size (D7). Pure, seeded.

import { createRng, fork } from '../sim/rng.js';
import { pooledStudentisedInterval } from './pooled-t.js';

/** @typedef {import('./report-pooled.js').PooledCell} PooledCell */

const BOOTSTRAP_SEED = 1;

/**
 * @param {readonly PooledCell[]} before the before arm, one cell per seed
 * @param {readonly PooledCell[]} after the after arm, in the same seed order
 * @param {Iterable<number>} chosen the seed indices to pool (repeats count again)
 * @returns {number | null} `after` ratio of sums minus `before` ratio of sums over the chosen seeds; null when either arm has no
 *   exposure in them
 */
export function pooledDiff(before, after, chosen) {
    let bn = 0;
    let bd = 0;
    let an = 0;
    let ad = 0;
    for (const k of chosen) {
        bn += before[k].num;
        bd += before[k].den;
        an += after[k].num;
        ad += after[k].den;
    }
    return bd > 0 && ad > 0 ? an / ad - bn / bd : null;
}

/**
 * @param {readonly PooledCell[]} before the before arm, one cell per seed
 * @param {readonly PooledCell[]} after the after arm, the same seeds in the same order
 * @param {{ level: number, resamples: number }} options the confidence level and the number of resamples of whole seeds
 * @returns {{ low: number, high: number }} the studentised interval of the pooled difference (`pooled-t.js`). Each call forks `createRng(1)` as
 *   `bootstrap`, as `bootstrapInterval` does. A resample whose arm has no exposure is dropped. The caller has checked
 *   that the full arms have exposure.
 */
export function pooledInterval(before, after, { level, resamples }) {
    const rng = fork(createRng(BOOTSTRAP_SEED), 'bootstrap');
    return pooledStudentisedInterval(before, after, { rng, resamples, level });
}
