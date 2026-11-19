// The ladder screen's learnability check (docs/designs/training-loop.md, Learnability check): runs `checkLadder` once per
// distinct arm ladder before any training, marks the arms whose ladder holds an unlearnable stage within `until`, and
// leaves them out when the grid sets `skipUnlearnable`. A detector only: the check never changes a run's world or gate.
import { checkLadder } from './feasible-run.mjs';
import { ladderText } from './train-screen-grid.mjs';

/**
 * @typedef {import('./feasible-run.mjs').StageFeasible} StageFeasible
 * @typedef {(ladder: readonly Record<string, any>[], options: import('./feasible-run.mjs').CheckOptions) => Promise<StageFeasible[]>} Check
 */

/**
 * @param {readonly StageFeasible[]} stages a ladder's check
 * @returns {string[]} the stages that are not learnable
 */
export const unlearnableStages = (stages) => stages.filter((s) => s.learnable === false).map((s) => s.stage);

/**
 * Checks each distinct ladder of the plan once (arms with the same ladder share the result).
 * @param {import('./train-screen-grid.mjs').ScreenPlan} plan the plan
 * @param {{workers?: number, readConfig: (file: string) => Record<string, any>, log?: import('../../js/sim/log.js').SimLog,
 *   check?: Check}} io the pool size, the config reader, the log and the check (a test stands in for it)
 * @returns {Promise<Record<string, StageFeasible[]>>} each arm's result; empty when the plan turns the check off
 */
export async function checkArms(plan, { workers, readConfig, log, check = checkLadder }) {
    if (plan.feasible === null) {
        return {};
    }
    /** @type {Map<string, StageFeasible[]>} */
    const byLadder = new Map();
    /** @type {Record<string, StageFeasible[]>} */
    const checked = {};
    for (const arm of plan.arms) {
        const key = ladderText(arm.ladder);
        if (!byLadder.has(key)) {
            byLadder.set(
                key,
                await check(arm.ladder, { ...plan.feasible, until: plan.until, workers, readConfig, log }),
            );
        }
        checked[arm.name] = /** @type {StageFeasible[]} */ (byLadder.get(key));
    }
    return checked;
}

/**
 * @param {import('./train-screen-grid.mjs').ScreenPlan} plan the plan
 * @param {Record<string, StageFeasible[]>} checked each arm's check
 * @returns {{plan: import('./train-screen-grid.mjs').ScreenPlan, skipped: string[]}} the plan without the arms to skip (when
 *   the grid sets `skipUnlearnable`; the reference always stays, for it is what the others are compared with), and the
 *   skipped names
 */
export function withoutUnlearnable(plan, checked) {
    const skipped = plan.skipUnlearnable
        ? plan.arms
              .filter((a) => a.name !== plan.reference && unlearnableStages(checked[a.name] ?? []).length > 0)
              .map((a) => a.name)
        : [];
    return { plan: { ...plan, arms: plan.arms.filter((a) => !skipped.includes(a.name)) }, skipped };
}

/**
 * Adds the check to a screen's report: `verdicts.json` gets each arm's `unlearnable` stages (an arm left out reads
 * `skipped`), and the table a section naming them.
 * @param {{verdicts: Record<string, any>, table: string}} report the screen's report (changed in place)
 * @param {{checked: Record<string, StageFeasible[]>, skipped: string[]}} feasible the check and the skipped arms
 * @returns {void}
 */
export function markUnlearnable(report, { checked, skipped }) {
    const arms = Object.keys(checked);
    if (arms.length === 0) {
        return;
    }
    const unlearnable = Object.fromEntries(arms.map((arm) => [arm, unlearnableStages(checked[arm])]));
    report.verdicts.unlearnable = unlearnable;
    for (const arm of arms) {
        if (skipped.includes(arm)) {
            report.verdicts.arms[arm] = { verdict: 'skipped', unlearnable: unlearnable[arm], failed: 0 };
        } else if (report.verdicts.arms[arm] !== undefined) {
            report.verdicts.arms[arm].unlearnable = unlearnable[arm];
        }
    }
    const lines = arms.map((arm) => {
        const stages = unlearnable[arm];
        const note = skipped.includes(arm) ? ' (arm left out)' : '';
        return `- ${arm}: ${stages.length === 0 ? 'every checked stage learnable' : `unlearnable: ${stages.join(', ')}`}${note}`;
    });
    report.table = `${report.table}## Learnability\n\n${lines.join('\n')}\n`;
}
