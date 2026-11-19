// A ladder screen's results (docs/designs/training-loop.md, Ladder screen): each arm's yield, each arm's verdict against the
// reference, and the markdown table.
import { ladderYield } from '../../js/evo/ladder-yield.js';
import { compareYield } from '../../js/evo/yield-compare.js';
import { formatCompare } from './yield-compare-report.mjs';
import { loadRuns } from './yield-files.mjs';
import { formatRuns, formatYield } from './yield-report.mjs';

/**
 * @param {import('./train-screen-grid.mjs').ScreenArm} arm an arm
 * @param {string | null} until the stage each run stops after
 * @returns {string[]} the arm's stage names up to and including `until`
 */
function stageNames(arm, until) {
    const names = arm.ladder.map((entry) => entry.name);
    const cut = until === null ? -1 : names.indexOf(until);
    return cut < 0 ? names : names.slice(0, cut + 1);
}

/**
 * @typedef {object} ArmResult
 * @property {string} arm the arm's name
 * @property {ReturnType<typeof ladderYield>} yielded the arm's ladder yield
 * @property {import('../../js/evo/ladder-yield.js').RunYield[]} runs each finished run's yield
 * @property {number} failed runs that failed (left out of the yield)
 */

/**
 * @param {import('./train-screen-grid.mjs').ScreenPlan} plan the plan
 * @param {readonly import('./train-screen-run.mjs').RunOutcome[]} outcomes the runs' outcomes
 * @returns {ArmResult[]} each arm's result
 */
function armResults(plan, outcomes) {
    return plan.arms.map((arm) => {
        const mine = outcomes.filter((o) => o.arm === arm.name);
        const { runs } = loadRuns(mine.filter((o) => o.status !== 'failed').map((o) => o.dir));
        return {
            arm: arm.name,
            yielded: ladderYield(runs, stageNames(arm, plan.until)),
            runs,
            failed: mine.filter((o) => o.status === 'failed').length,
        };
    });
}

/**
 * @param {ArmResult} reference the reference arm's result
 * @param {ArmResult} arm another arm's result
 * @returns {{verdict: string, reason?: string, compare?: import('../../js/evo/yield-compare.js').YieldCompare}} the arm's
 *   verdict against the reference; `refused` when there are too few matched offsets
 */
function verdictOf(reference, arm) {
    try {
        const stages = {
            before: reference.yielded.stages.map((s) => s.stage),
            after: arm.yielded.stages.map((s) => s.stage),
        };
        const compare = compareYield(reference.runs, arm.runs, { stages });
        return {
            verdict: compare.verdict,
            ...(compare.reason === undefined ? {} : { reason: compare.reason }),
            compare,
        };
    } catch (error) {
        return { verdict: 'refused', reason: /** @type {Error} */ (error).message };
    }
}

/**
 * @param {import('./train-screen-grid.mjs').ScreenPlan} plan the plan
 * @param {readonly import('./train-screen-run.mjs').RunOutcome[]} outcomes the runs' outcomes
 * @returns {{yield: Record<string, any>, verdicts: Record<string, any>, table: string, results: ArmResult[]}} `yield.json`,
 *   `verdicts.json` and `table.md` of the screen
 */
export function screenReport(plan, outcomes) {
    const results = armResults(plan, outcomes);
    const reference = /** @type {ArmResult} */ (results.find((r) => r.arm === plan.reference));
    /** @type {Record<string, any>} */
    const verdicts = { reference: plan.reference, arms: {} };
    const lines = [`# Ladder screen (reference: ${plan.reference})`, ''];
    for (const result of results) {
        lines.push(`## ${result.arm}`, '', '```', ...formatRuns(result.runs), '', ...formatYield(result.yielded));
        if (result.failed > 0) {
            lines.push(`${result.failed} run(s) failed and are left out`);
        }
        if (result.arm !== plan.reference) {
            const verdict = verdictOf(reference, result);
            verdicts.arms[result.arm] = { ...verdict, failed: result.failed };
            lines.push(
                '',
                ...(verdict.compare === undefined
                    ? [`verdict: refused (${verdict.reason})`]
                    : formatCompare(verdict.compare, { before: reference.yielded, after: result.yielded })),
            );
        }
        lines.push('```', '');
    }
    const yielded = Object.fromEntries(results.map((r) => [r.arm, { ...r.yielded, perRun: r.runs, failed: r.failed }]));
    return { yield: yielded, verdicts, table: `${lines.join('\n')}\n`, results };
}
