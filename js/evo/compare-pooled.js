// The comparison of a pooled metric (docs/designs/metric-noise.md, Phase 2): each arm's estimate is the ratio of the
// sums of its seeds' numerators and denominators, and the interval resamples whole seeds (the same seed in both arms,
// as `compare.js` pairs them) and recomputes both ratios, so the seed is the unit that varies and an event is never an
// independent draw. BCa, as `bootstrapInterval`: bias from the share of resamples below the observed difference,
// acceleration from the leave-one-seed-out differences. Pure, seeded.

import { createRng, fork, nextInt } from '../sim/rng.js';
import { normalCdf, normalQuantile } from './normal.js';

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
 * @param {readonly PooledCell[]} before the before arm
 * @param {readonly PooledCell[]} after the after arm
 * @param {import('../sim/rng.js').Rng} rng the stream that draws the seed indices
 * @param {number} resamples how many resamples of whole seeds
 * @returns {Float64Array} the pooled differences of the resamples that had exposure in both arms, sorted ascending
 */
export function resampledDiffs(before, after, rng, resamples) {
    const n = before.length;
    const out = new Float64Array(resamples);
    let kept = 0;
    for (let b = 0; b < resamples; b++) {
        let bn = 0;
        let bd = 0;
        let an = 0;
        let ad = 0;
        for (let i = 0; i < n; i++) {
            const k = nextInt(rng, n);
            bn += before[k].num;
            bd += before[k].den;
            an += after[k].num;
            ad += after[k].den;
        }
        if (bd > 0 && ad > 0) {
            out[kept++] = an / ad - bn / bd;
        }
    }
    return out.slice(0, kept).sort();
}

/**
 * @param {readonly PooledCell[]} before the before arm
 * @param {readonly PooledCell[]} after the after arm
 * @returns {number} the jackknife acceleration of the pooled difference (0 when the leave-one-out differences agree)
 */
function acceleration(before, after) {
    const n = before.length;
    const loo = [];
    for (let skip = 0; skip < n; skip++) {
        const diff = pooledDiff(
            before,
            after,
            Array.from({ length: n }, (_, i) => i).filter((i) => i !== skip),
        );
        if (diff !== null) {
            loo.push(diff);
        }
    }
    const centre = loo.reduce((t, d) => t + d, 0) / loo.length;
    let squares = 0;
    let cubes = 0;
    for (const d of loo) {
        const off = centre - d;
        squares += off * off;
        cubes += off * off * off;
    }
    return squares === 0 ? 0 : cubes / (6 * squares * Math.sqrt(squares));
}

/**
 * @param {readonly PooledCell[]} before the before arm, one cell per seed
 * @param {readonly PooledCell[]} after the after arm, the same seeds in the same order
 * @param {{ level: number, resamples: number }} options the confidence level and the number of resamples of whole seeds
 * @returns {{ low: number, high: number }} the BCa interval of the pooled difference. Each call forks `createRng(1)` as
 *   `bootstrap`, as `bootstrapInterval` does. A resample whose arm has no exposure is dropped. The caller has checked
 *   that the full arms have exposure.
 */
export function pooledInterval(before, after, { level, resamples }) {
    const diffs = resampledDiffs(before, after, fork(createRng(BOOTSTRAP_SEED), 'bootstrap'), resamples);
    const m = diffs.length;
    const observed = /** @type {number} */ (pooledDiff(before, after, before.keys()));
    if (m === 0 || diffs[0] === diffs[m - 1]) {
        return { low: m === 0 ? observed : diffs[0], high: m === 0 ? observed : diffs[0] };
    }
    let below = 0;
    while (below < m && diffs[below] < observed) {
        below++;
    }
    const z0 = normalQuantile(Math.min(1 - 0.5 / m, Math.max(0.5 / m, below / m)));
    const a = acceleration(before, after);
    const adjust = (/** @type {number} */ z) => normalCdf(z0 + (z0 + z) / (1 - a * (z0 + z)));
    const pick = (/** @type {number} */ p) => diffs[Math.min(m - 1, Math.max(0, Math.floor(p * m)))];
    const tail = (1 - level) / 2;
    return { low: pick(adjust(normalQuantile(tail))), high: pick(adjust(normalQuantile(1 - tail))) };
}
