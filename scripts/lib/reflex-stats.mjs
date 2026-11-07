// Rank statistics for the reflex validation study (brain-reflex-tests.md, Validation): the partial rho controlling for a
// group, and a BCa interval that resamples clusters (runs and lineages), not single genomes. Spearman's rho itself is
// `spearman` in js/evo/metrics-stats.js.
import { normalCdf, normalQuantile } from '../../js/evo/compare.js';
import { pearson, ranks, spearman } from '../../js/evo/metrics-stats.js';
import { createRng, fork, nextInt } from '../../js/sim/rng.js';

/**
 * @param {readonly number[]} values numbers
 * @param {readonly number[]} groups a group label for each
 * @returns {number[]} the values less their group's mean
 */
function centred(values, groups) {
    const sums = new Map();
    values.forEach((v, i) => {
        const [sum, count] = sums.get(groups[i]) ?? [0, 0];
        sums.set(groups[i], [sum + v, count + 1]);
    });
    return values.map((v, i) => v - sums.get(groups[i])[0] / sums.get(groups[i])[1]);
}

/**
 * Spearman's rho with a categorical control removed: the ranks of both variables, less their group means, correlated.
 * @param {readonly number[]} x numbers
 * @param {readonly number[]} y numbers of the same length
 * @param {readonly number[]} control the control's category of each pair (for example the specialisation)
 * @returns {number} the partial rank correlation; NaN when nothing is left to vary
 */
export function partialSpearman(x, y, control) {
    return pearson(centred([...ranks(x)], control), centred([...ranks(y)], control));
}

/**
 * @typedef {object} Interval
 * @property {number} estimate the statistic on all the data
 * @property {number} low the lower end of the BCa interval
 * @property {number} high the upper end
 */

/**
 * A BCa interval of a statistic that resamples whole clusters: each resample draws as many clusters as there are, with
 * replacement, and takes every row of each. The acceleration is from leaving one cluster out at a time.
 * @template T
 * @param {readonly T[]} rows the rows
 * @param {{stat: (rows: T[]) => number, cluster: (row: T) => string, resamples?: number, seed?: number, level?: number}} options
 *   the statistic of a set of rows, the cluster each row belongs to, the resample count (default 2000), the seed
 *   (default 1) and the level (default 0.95)
 * @returns {Interval} the estimate and the interval; NaN ends when the statistic is undefined on the data
 */
export function clusterBca(rows, { stat, cluster, resamples = 2000, seed = 1, level = 0.95 }) {
    const byCluster = new Map();
    for (const row of rows) {
        byCluster.set(cluster(row), [...(byCluster.get(cluster(row)) ?? []), row]);
    }
    const clusters = [...byCluster.values()];
    const estimate = stat([...rows]);
    if (clusters.length < 3 || Number.isNaN(estimate)) {
        return { estimate, low: Number.NaN, high: Number.NaN };
    }
    const rng = fork(createRng(seed), 'reflex-bca');
    const draws = Array.from({ length: resamples }, () =>
        stat(Array.from({ length: clusters.length }, () => clusters[nextInt(rng, clusters.length)]).flat()),
    )
        .filter((v) => !Number.isNaN(v))
        .sort((a, b) => a - b);
    if (draws.length < 10) {
        return { estimate, low: Number.NaN, high: Number.NaN };
    }
    const leaveOut = clusters
        .map((_, k) => stat(clusters.filter((__, j) => j !== k).flat()))
        .filter((v) => !Number.isNaN(v));
    const meanLeave = leaveOut.reduce((s, v) => s + v, 0) / leaveOut.length;
    const num = leaveOut.reduce((s, v) => s + (meanLeave - v) ** 3, 0);
    const den = leaveOut.reduce((s, v) => s + (meanLeave - v) ** 2, 0) ** 1.5;
    const a = den === 0 ? 0 : num / (6 * den);
    const below = draws.filter((v) => v < estimate).length;
    const z0 = normalQuantile(Math.min(1 - 0.5 / draws.length, Math.max(0.5 / draws.length, below / draws.length)));
    const pick = (/** @type {number} */ z) => {
        const p = normalCdf(z0 + (z0 + z) / (1 - a * (z0 + z)));
        return draws[Math.min(draws.length - 1, Math.max(0, Math.floor(p * draws.length)))];
    };
    const tail = (1 - level) / 2;
    return { estimate, low: pick(normalQuantile(tail)), high: pick(normalQuantile(1 - tail)) };
}

export { spearman };
