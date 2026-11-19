// Prints a ladder yield comparison (`train:compare`, `train:screen`): the matched pairs, the per-stage pass shares of the
// two arms side by side, the CPU hours and the verdict.
import { padTable } from './drill-report.mjs';

/** @typedef {import('../../js/evo/ladder-yield.js').StageYield} StageRow */

/**
 * @param {import('../../js/evo/yield-compare.js').YieldCompare} compare a `compareYield` result
 * @returns {string[]} one line per matched offset: the two scores and the difference
 */
export function formatPairs(compare) {
    const header = ['offset', 'before', 'after', 'diff'];
    const body = compare.pairs.map((p) => [
        String(p.offset),
        p.before.toFixed(3),
        p.after.toFixed(3),
        (p.diff > 0 ? '+' : '') + p.diff.toFixed(3),
    ]);
    return padTable([header, ...body]);
}

/**
 * @param {ReturnType<typeof import('../../js/evo/ladder-yield.js').ladderYield>} before the before arm's yield
 * @param {ReturnType<typeof import('../../js/evo/ladder-yield.js').ladderYield>} after the after arm's yield
 * @returns {string[]} one line per stage: its pass share, median generations to pass and CPU hours per pass in each arm
 */
export function formatStages(before, after) {
    const share = (/** @type {number} */ v) => `${(v * 100).toFixed(0)}%`;
    const num = (/** @type {number | null} */ v, /** @type {number} */ d) => (v === null ? '-' : v.toFixed(d));
    const header = ['stage', 'passed', 'median gens', 'cpu h / pass'];
    const names = [...new Set([...before.stages, ...after.stages].map((s) => s.stage))];
    const body = names.map((name) => {
        const b = before.stages.find((s) => s.stage === name);
        const a = after.stages.find((s) => s.stage === name);
        const cell = (/** @type {(s: StageRow) => string} */ read) => `${b ? read(b) : '-'} -> ${a ? read(a) : '-'}`;
        return [
            name,
            cell((s) => share(s.passShare)),
            cell((s) => num(s.medianGenerations, 0)),
            cell((s) => num(s.cpuHoursPerPass, 2)),
        ];
    });
    return padTable([header, ...body]);
}

/**
 * @param {import('../../js/evo/yield-compare.js').YieldCompare} compare a `compareYield` result
 * @param {{before: ReturnType<typeof import('../../js/evo/ladder-yield.js').ladderYield>, after: ReturnType<typeof import('../../js/evo/ladder-yield.js').ladderYield>}} arms
 *   the two arms' yields
 * @returns {string[]} the pairs, the stages side by side, the CPU hours, the unmatched offsets and the verdict
 */
export function formatCompare(compare, { before, after }) {
    const lines = [...formatPairs(compare), '', ...formatStages(before, after), ''];
    lines.push(`passed last stage ${before.passedLast} -> ${after.passedLast}`);
    const cpu = `cpu hours ${before.cpuHours.toFixed(1)} -> ${after.cpuHours.toFixed(1)}`;
    lines.push(`${cpu} (${((after.cpuHours / (before.cpuHours || 1) - 1) * 100).toFixed(0)}%)`);
    if (compare.verdict === 'incomparable') {
        lines.push(`verdict: incomparable (${compare.reason})`);
        return lines;
    }
    lines.push(`matched ${compare.matched}: ${compare.up} up, ${compare.down} down, ${compare.tied} tied`);
    if (compare.onlyBefore.length > 0 || compare.onlyAfter.length > 0) {
        lines.push(`unmatched offsets: before only [${compare.onlyBefore}], after only [${compare.onlyAfter}]`);
    }
    const { low, high } = compare.interval;
    lines.push(
        `mean score difference ${compare.meanDiff.toFixed(3)} [${low.toFixed(3)}, ${high.toFixed(3)}], sign test p ${compare.p.toFixed(4)}`,
        `verdict: ${compare.verdict}`,
    );
    return lines;
}
