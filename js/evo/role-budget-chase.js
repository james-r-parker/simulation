// The hunter against one prey (docs/designs/role-budget.md, "Phase 1 steps"): the slack of each step by bisection on a
// delay, the two prey bounds, the three performer tiers, the energy and the heat of the chase. Every number comes
// from `chaseTimeline`, so a margin cannot disagree with the verdict. Pure.

import { MAX_TICKS } from './role-budget-timeline.js';
import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { gapAtAwareness, maxCatchableGap, playFrame } from './role-budget-frame.js';
import { refillTicks } from './role-budget-kinematics.js';
import { fitForRung, learnSlope, tierMargins } from './role-budget-tiers.js';

export { MAX_TICKS, chaseTimeline } from './role-budget-timeline.js';
export { gapAtAwareness, gapAtSight, maxCatchableGap, playFrame } from './role-budget-frame.js';
export { fitForRung, learnSlope, tierMargins } from './role-budget-tiers.js';

/**
 * @typedef {object} ChaseBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row of the four steps
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells the four cells
 * @property {import('./role-budget-tiers.js').TierMargins} tiers the catch margin of each tier on both bounds, in px
 * @property {string} learnSlope `ok` or the tier that fails
 * @property {boolean} fit whether the pair is fit for the rung screen
 * @property {boolean} catchable whether the perfect hunter closes the broken bound
 * @property {number} catchMargin the perfect hunter's broken-bound margin, in px
 * @property {{margins: number[], share: number, worst: number} | null} bearings the broken-bound margin at each audit bearing
 * @property {{spent: number, kick: number, income: number, net: number, holds: number}} chaseEnergy the chase's energy
 * @property {{gain: number, headroom: number}} chaseHeat the temperature gained against the headroom to the optimal band
 * @property {number} refillTicks the ticks to refill the store spent in the chase
 * @property {number} gapAtAwareness the centre gap at which the prey first sees the hunter
 * @property {string | null} binding the step of least slack
 */

/** The prey rows of the matrix, in order: the specialisations a hunter is budgeted against. */
export const PREY_SPECS = Object.freeze(['forager', 'reproducer', 'scout', 'defender']);

/** The bearings of `audit:chase`: eight, from -PI in steps of PI / 4. */
export const AUDIT_BEARINGS = Object.freeze(Array.from({ length: 8 }, (_, b) => (2 * Math.PI * b) / 8 - Math.PI));

/**
 * The slack of one step: the largest delay, in ticks, at that step for which a perfect hunter still kills inside
 * `MAX_TICKS`, the other steps perfect, found by bisection; capped at `SLACK_CAP`.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {'see' | 'turn' | 'run'} step the step delayed
 * @param {import('./role-budget-frame.js').Frame} frame the frame the delay is added to
 * @returns {number | null} the slack, null when the hunter fails with no delay
 */
export function stepSlack(hunter, prey, step, frame) {
    const aware = gapAtAwareness(hunter, prey);
    const completes = (/** @type {number} */ delay) =>
        playFrame(hunter, prey, aware, { ...frame, delays: { [step]: delay } }).killTick !== null;
    if (!completes(0)) {
        return null;
    }
    if (completes(SLACK_CAP)) {
        return SLACK_CAP;
    }
    let lo = 0;
    let hi = SLACK_CAP;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (completes(mid)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * @param {import('./role-budget-timeline.js').Timeline} run the perfect chase
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @returns {number | null} the slack of the bite step: the ticks of `strikeMissCost` the hunter can pay, and the chase can
 *   run, after the kill; null when the size gate refuses the bite
 */
function biteSlack(run, hunter) {
    const byEnergy = hunter.bite.miss > 0 ? Math.floor(run.hunterEnergy / hunter.bite.miss) : SLACK_CAP;
    return Math.min(SLACK_CAP, MAX_TICKS - /** @type {number} */ (run.killTick), byEnergy);
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {import('./role-budget-timeline.js').Timeline} run the perfect chase at the awareness gap
 * @returns {Record<string, import('./role-budget-cell.js').Cell>} the four cells: the slack of each step; when the
 *   chase does not end in a kill the steps are not read, the one that fails (the run, or the bite when the size gate
 *   refuses it or the prey is not held) is impossible
 */
function cellsOf(hunter, prey, model, run) {
    const frame = { model };
    const unread = () => cell(undefined, model);
    const margin = maxCatchableGap(hunter, prey, frame) - gapAtAwareness(hunter, prey);
    if (run.contactTick !== null && !run.gate) {
        return { see: unread(), turn: unread(), run: unread(), bite: cell(null, model) };
    }
    if (run.killTick === null) {
        const bite = run.contactTick === null ? unread() : cell(null, model);
        return { see: unread(), turn: unread(), run: cell(null, model, { distance: margin }), bite };
    }
    const slack = (/** @type {'see' | 'turn' | 'run'} */ step) => stepSlack(hunter, prey, step, frame);
    return {
        see: cell(slack('see'), model),
        turn: cell(slack('turn'), model),
        run: cell(slack('run'), model, { distance: margin }),
        bite: cell(biteSlack(run, hunter), model),
    };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {{margins: number[], share: number, worst: number}} the broken-bound catch margin in px at each bearing of
 *   `audit:chase`, the share of bearings that close, and the worst margin
 */
function bearingsOf(hunter, prey, model) {
    const aware = gapAtAwareness(hunter, prey);
    const margins = AUDIT_BEARINGS.map((bearing) => maxCatchableGap(hunter, prey, { bearing, model }) - aware);
    return {
        margins,
        share: margins.filter((m) => m >= 0).length / margins.length,
        worst: Math.min(...margins),
    };
}

/**
 * The budget of a hunter against a prey: the four step cells of the perfect performer on the broken bound facing the
 * prey, the margins of both bounds and all three tiers, the learn slope, and the chase's energy and heat.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{bearings?: boolean}} [options] whether to read the eight audit bearings (default true)
 * @returns {ChaseBudget} the budget
 */
export function budgetChase(hunter, prey, model, { bearings = true } = {}) {
    const aware = gapAtAwareness(hunter, prey);
    const run = playFrame(hunter, prey, aware, { model });
    const cells = cellsOf(hunter, prey, model, run);
    const row = rowOf(`${hunter.spec}:${prey.spec}`, cells);
    const tiers = tierMargins(hunter, prey, model);
    const slope = learnSlope(tiers, hunter, prey, model);
    return {
        row,
        cells,
        tiers,
        learnSlope: slope,
        fit: fitForRung(tiers, slope),
        catchable: tiers.perfect.broken >= 0,
        catchMargin: tiers.perfect.broken,
        bearings: bearings ? bearingsOf(hunter, prey, model) : null,
        chaseEnergy: {
            spent: run.hunterSpent,
            kick: run.kick,
            income: run.income,
            net: run.income - run.kick - run.hunterSpent,
            holds: hunter.energy - hunter.repro.birthReserve,
        },
        chaseHeat: { gain: run.heat, headroom: hunter.heat.optimalMax - hunter.heat.start },
        refillTicks: refillTicks(hunter.store, run.hunterLevel),
        gapAtAwareness: aware,
        binding: row.binding,
    };
}
