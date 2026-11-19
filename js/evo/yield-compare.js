// Compares the ladder yields of two arms on matched seed offsets (docs/designs/training-loop.md, Ladder yield), the way
// `eval:compare` compares two worlds: an exact sign test and a bootstrap interval on the per-offset score differences.
// A detector, never fitness. Pure.

import { binomialTwoSidedP } from './binomial.js';
import { bootstrapInterval } from './compare.js';

/** Matched offsets below which a comparison is refused (tied pairs count). */
export const MIN_PAIRS = 16;
/** The sign test's two-sided level. */
export const SIGN_LEVEL = 0.05;

/**
 * @typedef {object} YieldCompare
 * @property {{offset: number, before: number, after: number, diff: number}[]} pairs each matched offset's scores
 * @property {number} matched the matched offsets, tied pairs included
 * @property {number} tied the pairs with equal scores (left out of the sign test)
 * @property {number} up pairs whose score rose
 * @property {number} down pairs whose score fell
 * @property {number[]} onlyBefore offsets present in the before arm only
 * @property {number[]} onlyAfter offsets present in the after arm only
 * @property {number} meanDiff the mean of the per-offset score differences (after - before)
 * @property {{low: number, high: number}} interval the bootstrap interval of that mean
 * @property {number} p the exact two-sided sign test p-value over the untied pairs (1 when none)
 * @property {'better' | 'worse' | 'no verdict'} verdict `better` or `worse` when the sign test is under 0.05 and the
 *   interval excludes 0, else `no verdict`
 */

/**
 * @param {readonly {offset: number, score: number}[]} runs one arm's runs
 * @param {string} arm the arm's name for an error
 * @returns {Map<number, number>} each offset's score
 * @throws {Error} when an offset appears twice
 */
function byOffset(runs, arm) {
    const scores = new Map();
    for (const run of runs) {
        if (scores.has(run.offset)) {
            throw Object.assign(new Error(`the ${arm} arm has two runs at offset ${run.offset}`), { exitCode: 2 });
        }
        scores.set(run.offset, run.score);
    }
    return scores;
}

/**
 * @param {{low: number, high: number}} interval the bootstrap interval of the mean difference
 * @param {boolean} rose whether more pairs rose than fell
 * @returns {'better' | 'worse' | 'no verdict'} the sign test's direction when the interval excludes 0 on the same side
 */
function signed(interval, rose) {
    if (rose && interval.low > 0) {
        return 'better';
    }
    return !rose && interval.high < 0 ? 'worse' : 'no verdict';
}

/**
 * @param {readonly {offset: number, score: number}[]} before the before arm's runs (`runYield`)
 * @param {readonly {offset: number, score: number}[]} after the after arm's runs
 * @param {{minPairs?: number}} [options] the least matched offsets (default `MIN_PAIRS`)
 * @returns {YieldCompare} the comparison
 * @throws {Error} (`exitCode` 2) on fewer matched offsets than `minPairs`, tied pairs counted, or a repeated offset
 */
export function compareYield(before, after, { minPairs = MIN_PAIRS } = {}) {
    const first = byOffset(before, 'before');
    const second = byOffset(after, 'after');
    const offsets = [...first.keys()].filter((offset) => second.has(offset)).sort((a, b) => a - b);
    if (offsets.length < minPairs) {
        throw Object.assign(new Error(`need at least ${minPairs} matched offsets, got ${offsets.length}`), {
            exitCode: 2,
        });
    }
    const pairs = offsets.map((offset) => {
        const [b, a] = [/** @type {number} */ (first.get(offset)), /** @type {number} */ (second.get(offset))];
        return { offset, before: b, after: a, diff: a - b };
    });
    const up = pairs.filter((pair) => pair.diff > 0).length;
    const down = pairs.filter((pair) => pair.diff < 0).length;
    const diffs = pairs.map((pair) => pair.diff);
    const interval = bootstrapInterval(diffs);
    const p = binomialTwoSidedP(up + down, up);
    const verdict = p < SIGN_LEVEL ? signed(interval, up > down) : 'no verdict';
    return {
        pairs,
        matched: pairs.length,
        tied: pairs.length - up - down,
        up,
        down,
        onlyBefore: [...first.keys()].filter((offset) => !second.has(offset)).sort((a, b) => a - b),
        onlyAfter: [...second.keys()].filter((offset) => !first.has(offset)).sort((a, b) => a - b),
        meanDiff: diffs.reduce((sum, d) => sum + d, 0) / diffs.length,
        interval,
        p,
        verdict,
    };
}
