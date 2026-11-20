// The per-stage pass test of a ladder comparison (docs/designs/training-loop.md, Phase 5, A pass test per stage): on each
// matched offset a stage is passed or not in each arm; the exact two-sided test on the discordant offsets reads the stage
// `better` or `worse`. A detector, never fitness. Pure.

import { binomialTwoSidedP, leastDetectedLoss } from './binomial.js';

/** The two-sided level of a stage's pass test. */
export const STAGE_LEVEL = 0.05;

/**
 * @typedef {object} StageTest
 * @property {string} stage the stage's name
 * @property {number} gained offsets that failed the stage before and pass it after
 * @property {number} lost offsets that passed it before and fail it after
 * @property {number} same offsets where both arms agree
 * @property {number} p the exact two-sided p-value over the discordant offsets (1 when none)
 * @property {'better' | 'worse' | 'no verdict'} verdict the direction of the larger flip count when `p` is under 0.05
 * @property {number | null} leastFlips the fewest flips one way that would read a verdict against the smaller flip
 *   count the other way (null when no count of the matched offsets would)
 */

/**
 * @param {readonly {offset: number, passed?: readonly {stage: string}[]}[]} before the before arm's runs
 * @param {readonly {offset: number, passed?: readonly {stage: string}[]}[]} after the after arm's runs
 * @param {readonly string[]} stages the ladder's stage names
 * @returns {StageTest[]} one test per stage on the offsets both arms ran; empty when a run carries no `passed` list
 */
export function stageTests(before, after, stages) {
    const second = new Map(after.map((run) => [run.offset, run]));
    const pairs = before.flatMap((run) => {
        const other = second.get(run.offset);
        return other === undefined || run.passed === undefined || other.passed === undefined
            ? []
            : [{ before: run.passed, after: other.passed }];
    });
    if (pairs.length === 0) {
        return [];
    }
    return stages.map((stage) => {
        const has = (/** @type {readonly {stage: string}[]} */ passed) => passed.some((p) => p.stage === stage);
        const gained = pairs.filter((pair) => !has(pair.before) && has(pair.after)).length;
        const lost = pairs.filter((pair) => has(pair.before) && !has(pair.after)).length;
        const p = binomialTwoSidedP(gained + lost, gained);
        const minority = Math.min(gained, lost);
        /** @type {StageTest['verdict']} */
        const verdict = p < STAGE_LEVEL ? (gained > lost ? 'better' : 'worse') : 'no verdict';
        return {
            stage,
            gained,
            lost,
            same: pairs.length - gained - lost,
            p,
            verdict,
            leastFlips: leastDetectedLoss(minority, pairs.length - minority),
        };
    });
}
