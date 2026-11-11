// Screen per-seed criteria against the reference (metric-trust T31a): each arm's passing seed share with an exact paired
// test on the seeds that moved, in place of "every seed passes". Pure.

import { binomialTwoSidedP, exactWorse } from '../../js/evo/binomial.js';

/** The per-seed criteria compared with the reference; `catchRate` is a threshold on every seed and stays out. */
export const PAIRED_CRITERIA = ['popAboveMin', 'lineages', 'specShare', 'popBelowMax'];

/**
 * @typedef {object} SeedVsReference
 * @property {number} pass seeds that pass in the arm
 * @property {number} of seeds run
 * @property {number} share `pass / of`
 * @property {number} diff the arm's passing share minus the reference's, over the same seeds
 * @property {number} lost seeds that pass in the reference and fail in the arm (`b` of the McNemar test)
 * @property {number} regained seeds that fail in the reference and pass in the arm (`c`)
 * @property {number} p the exact two-sided p of `lost` against `lost + regained`
 * @property {boolean} worse whether more seeds were lost than regained and p is below 0.05
 */

/**
 * @param {{ pass: boolean[] }} arm one per-seed criterion of the arm
 * @param {{ pass: boolean[] }} reference the same criterion of the reference
 * @returns {SeedVsReference} the arm's passing share and its paired comparison with the reference
 */
export function seedVsReference(arm, reference) {
    const of = arm.pass.length;
    const count = (/** @type {boolean} */ from, /** @type {boolean} */ to) =>
        arm.pass.filter((v, i) => reference.pass[i] === from && v === to).length;
    const lost = count(true, false);
    const regained = count(false, true);
    const pass = arm.pass.filter(Boolean).length;
    return {
        pass,
        of,
        share: pass / of,
        diff: (pass - reference.pass.filter(Boolean).length) / of,
        lost,
        regained,
        p: binomialTwoSidedP(lost + regained, lost),
        worse: exactWorse(lost, regained),
    };
}

/**
 * @param {Record<string, { pass: boolean[] }>} criteria the arm's per-seed criteria
 * @param {Record<string, { pass: boolean[] }>} reference the reference's
 * @returns {Record<string, SeedVsReference>} each `PAIRED_CRITERIA` entry against the reference
 */
export function seedsVsReference(criteria, reference) {
    return Object.fromEntries(PAIRED_CRITERIA.map((key) => [key, seedVsReference(criteria[key], reference[key])]));
}
