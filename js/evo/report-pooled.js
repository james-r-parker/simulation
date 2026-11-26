// Pooled metrics (docs/designs/metric-noise.md, Phase 2): a rate or share whose report carries each seed's numerator and
// denominator (`pooled: [{num, den}]`, one per seed) next to the per-seed value `num / den`. The arm's estimate is the
// ratio of sums, never the mean of the seed ratios, and a seed with `den` 0 adds no exposure. Pure.

import { none, ok } from './metrics-stats.js';

/** @typedef {{ num: number, den: number }} PooledCell one seed's sufficient statistics */

/**
 * @param {number} num the seed's numerator (events, energy, hunter-ticks with the wish)
 * @param {number} den the seed's denominator, its opportunities; 0 is a seed with none
 * @param {string} reason the reason the value is null when `den` is 0
 * @returns {import('./metrics-stats.js').MetricResult & PooledCell} the per-seed value `num / den` (null at `den` 0)
 *   with the sums the report pools
 */
export function pooledResult(num, den, reason) {
    return { ...(den > 0 ? ok(num / den) : none(reason)), num, den };
}

/**
 * @param {readonly PooledCell[]} cells one cell per seed
 * @returns {number | null} `sum(num) / sum(den)`, null when no seed had an opportunity
 */
export function pooledEstimate(cells) {
    let num = 0;
    let den = 0;
    for (const cell of cells) {
        num += cell.num;
        den += cell.den;
    }
    return den > 0 ? num / den : null;
}

/**
 * @param {readonly (Record<string, any> | undefined)[]} cells one metric result per seed
 * @returns {PooledCell[] | undefined} each seed's sufficient statistics (zero exposure for a seed that gave none), or
 *   undefined when no seed gave any (the metric is not pooled)
 */
export function pooledCells(cells) {
    const has = (/** @type {Record<string, any> | undefined} */ c) =>
        typeof c?.num === 'number' && typeof c.den === 'number';
    if (!cells.some(has)) {
        return undefined;
    }
    return cells.map((cell) =>
        has(cell)
            ? { num: /** @type {number} */ (cell?.num), den: /** @type {number} */ (cell?.den) }
            : { num: 0, den: 0 },
    );
}

/**
 * @param {Record<string, any>} metric a report metric that carries `pooled`
 * @param {string} path the metric's path, for the message
 * @param {number} count the seed count
 * @returns {void}
 * @throws {Error} `invalid report: <path>.pooled...` when a cell is not finite, has negative exposure or disagrees with
 *   the seed's value (`num / den`, null exactly when `den` is 0)
 */
export function checkPooled(metric, path, count) {
    const { pooled, values } = metric;
    const bad = (/** @type {string} */ field, /** @type {string} */ want) => {
        throw new Error(`invalid report: ${path}.${field} must be ${want}`);
    };
    if (!Array.isArray(pooled) || pooled.length !== count) {
        bad('pooled', `an array of ${count}`);
    }
    for (let i = 0; i < count; i++) {
        const { num, den } = pooled[i] ?? {};
        if (!Number.isFinite(num) || !Number.isFinite(den) || den < 0) {
            bad(`pooled[${i}]`, 'a num and a den, finite, with den at least 0');
        }
        const agrees = den === 0 ? values[i] === null : values[i] === num / den;
        if (!agrees) {
            bad(`pooled[${i}]`, 'num / den as the seed value, and null exactly when den is 0');
        }
    }
}
