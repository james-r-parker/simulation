// The studentised (bootstrap-t) interval of a pooled difference (metric-noise.md D7), for the small arms where the BCa
// interval under-covers. The pooled difference is a ratio estimator, so its standard error is the delta-method one:
// seed i carries the influence value z_i = (an_i - Ra * ad_i) / mean(ad) - (bn_i - Rb * bd_i) / mean(bd) and the
// standard error is sd(z) / sqrt(n). Each resample of whole seeds (the same seed in both arms) gets its own standard
// error from its own influence values. Pure, seeded.

import { fillIndices, tInterval } from './bootstrap-t.js';

/** @typedef {import('./report-pooled.js').PooledCell} PooledCell */

/**
 * @param {readonly PooledCell[]} before the before arm, one cell per seed
 * @param {readonly PooledCell[]} after the after arm, in the same seed order
 * @param {ArrayLike<number>} chosen the seed indices to pool (repeats count again)
 * @returns {{ diff: number, se: number } | null} the pooled difference of the chosen seeds and its delta-method
 *   standard error; null when either arm has no exposure in them
 */
export function pooledStat(before, after, chosen) {
    const n = chosen.length;
    let bn = 0;
    let bd = 0;
    let an = 0;
    let ad = 0;
    for (let i = 0; i < n; i++) {
        bn += before[chosen[i]].num;
        bd += before[chosen[i]].den;
        an += after[chosen[i]].num;
        ad += after[chosen[i]].den;
    }
    if (!(bd > 0 && ad > 0)) {
        return null;
    }
    const ra = an / ad;
    const rb = bn / bd;
    let squares = 0;
    for (let i = 0; i < n; i++) {
        const a = after[chosen[i]];
        const b = before[chosen[i]];
        const z = ((a.num - ra * a.den) * n) / ad - ((b.num - rb * b.den) * n) / bd;
        squares += z * z;
    }
    return { diff: ra - rb, se: Math.sqrt(squares / (n - 1) / n) };
}

/**
 * @param {readonly PooledCell[]} before the before arm
 * @param {readonly PooledCell[]} after the after arm
 * @param {{ rng: import('../sim/rng.js').Rng, resamples: number, observed: number }} draw the stream, the number of
 *   resamples and the observed difference
 * @returns {Float64Array} the t statistic of each resample with exposure in both arms and a standard error above 0,
 *   sorted ascending
 */
function resampledStatistics(before, after, { rng, resamples, observed }) {
    const n = before.length;
    const pick = new Int32Array(n);
    const stats = new Float64Array(resamples);
    let count = 0;
    for (let b = 0; b < resamples; b++) {
        fillIndices(rng, pick);
        const s = pooledStat(before, after, pick);
        if (s !== null && s.se > 0) {
            stats[count++] = (s.diff - observed) / s.se;
        }
    }
    return stats.subarray(0, count).sort();
}

/**
 * @param {readonly PooledCell[]} before the before arm, one cell per seed
 * @param {readonly PooledCell[]} after the after arm, the same seeds in the same order
 * @param {{ rng: import('../sim/rng.js').Rng, resamples: number, level: number }} options the stream, the number of
 *   resamples of whole seeds and the confidence level
 * @returns {{ low: number, high: number }} the studentised interval: the observed difference less the upper and lower
 *   quantiles of the resample t statistics times the observed standard error. A point interval when no resample has
 *   a usable standard error or the observed one is 0. The caller has checked that the full arms have exposure.
 */
export function pooledStudentisedInterval(before, after, { rng, resamples, level }) {
    const all = Array.from({ length: before.length }, (_, i) => i);
    const { diff, se } = /** @type {{ diff: number, se: number }} */ (pooledStat(before, after, all));
    const stats = resampledStatistics(before, after, { rng, resamples, observed: diff });
    if (stats.length === 0 || se === 0) {
        return { low: diff, high: diff };
    }
    return tInterval(stats, { observed: diff, se, level });
}
