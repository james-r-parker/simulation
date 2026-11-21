// The defender against a hunter closing on a caller (docs/designs/role-budget.md, "Phase 2 steps"): hear, turn, run,
// intercept and smoke, each a slack in ticks found on `defenceTimeline`. Pure: it reads `RoleParams` and the model.

import { defenceTimeline } from './role-budget-defence.js';
import { escortGap } from './role-budget-escort.js';
import { frameOptions, gapAtAwareness } from './role-budget-frame.js';
import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { hearWindow } from './role-budget-senses.js';
import { defenderSmokeGeometry } from './role-budget-smoke.js';

export { defenderSmokeGeometry, smokeCell } from './role-budget-smoke.js';

/** The steps of the defender's row, in order. */
export const DEFEND_STEPS = Object.freeze(['hear', 'turn', 'run', 'intercept', 'smoke']);

/**
 * @typedef {object} DefendBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `defender:predator`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells the five cells
 * @property {{on: boolean, breaksBite: boolean, energy: number, cost: number, impulse: number, prevented: number}} repel
 *   whether the shove is on, whether it delays or stops the kill, its numbers and the bite energy the delay prevents
 * @property {import('./role-budget-defence.js').Defence} run the defence with no delay
 * @property {import('./role-budget-defence.js').Defence} baseline the same scene with no defender
 * @property {import('./role-budget-smoke.js').DefenderSmoke} smoke the defender's smoke
 * @property {{taken: number, kick: number}} defenderBite what a hunter's bite on the defender takes of it and costs the hunter
 * @property {string | null} binding the step of least slack, `repel: off` when the shove is off
 */

/** @typedef {Array<import('./role-budget-params.js').RoleParams>} Bodies the hunter, the caller and the defender */
/** @typedef {import('./role-budget-model.js').RoleModel} Model */
/** @typedef {Record<string, number>} Delays ticks added at one step of the defender */

/**
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @returns {boolean} whether the shove is on: `defenderRepelEnergy` or `defenderRepelImpulse` above 0
 */
const repelOn = (defender) => defender.repel.energy > 0 || defender.repel.impulse > 0;

/**
 * @param {Bodies} bodies the hunter, the caller and the defender
 * @param {Model} model the model options
 * @param {{delays?: Delays, absent?: boolean}} [play] the delays, and whether the defender is left out
 * @returns {import('./role-budget-defence.js').Defence} the defence
 */
function playDefence([hunter, caller, defender], model, play = {}) {
    const start = frameOptions(hunter, caller, gapAtAwareness(hunter, caller), { tier: 'perfect', model });
    return defenceTimeline(hunter, caller, defender, {
        reaction: model.reactionTicks,
        threshold: model.hearThreshold,
        side: escortGap(defender, caller, model),
        gap: start.gap,
        hunter: start.hunter,
        ...play,
    });
}

/**
 * @param {import('./role-budget-defence.js').Defence} run the defence
 * @param {boolean} shoves whether the shove is on
 * @returns {number | null} the tick the defender lands its power: the shove with it on, the first touch with it off
 */
const arrival = (run, shoves) => (shoves ? run.repelTick : run.interceptTick);

/**
 * The largest delay at one step for which the defender still lands its power before the kill.
 * @param {(delays: Delays) => boolean} completes whether the defence still completes with the delays
 * @param {'hear' | 'turn' | 'run'} step the step delayed
 * @returns {number} the slack, capped at `SLACK_CAP`
 */
function slackOf(completes, step) {
    if (completes({ [step]: SLACK_CAP })) {
        return SLACK_CAP;
    }
    let lo = 0;
    let hi = SLACK_CAP;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (completes({ [step]: mid })) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * @param {Bodies} bodies the hunter, the caller and the defender
 * @param {Model} model the model options
 * @returns {import('./role-budget-cell.js').Cell} the intercept cell: the ticks the defender arrives with its shove before the
 *   kill; impossible with the shove off, or when it never lands one, or lands it after the kill
 */
function interceptCell(bodies, model) {
    const shoves = repelOn(bodies[2]);
    const kill = playDefence(bodies, model, { absent: true }).killTick;
    const at = arrival(playDefence(bodies, model), shoves);
    const spare = at !== null && kill !== null ? kill - at : 0;
    return cell(shoves && spare >= 1 ? spare : null, model);
}

/**
 * @param {Bodies} bodies the hunter, the caller and the defender
 * @param {Model} model the model options
 * @returns {Record<string, import('./role-budget-cell.js').Cell>} the hear, turn, run and intercept cells; a defender that
 *   never hears the call reads no step after `hear`, and one that cannot arrive before the kill (the shove's tick when it is
 *   on, the first touch when it is off) has an impossible `run`
 */
function stepCells(bodies, model) {
    const shoves = repelOn(bodies[2]);
    const kill = playDefence(bodies, model, { absent: true }).killTick;
    const completes = (/** @type {Delays} */ delays) => {
        const at = arrival(playDefence(bodies, model, { delays }), shoves);
        return at !== null && kill !== null && at < kill;
    };
    const intercept = interceptCell(bodies, model);
    const none = cell(undefined, model);
    if (playDefence(bodies, model).heardTick < 0) {
        return { hear: cell(null, model), turn: none, run: none, intercept };
    }
    const audible = hearWindow(escortGap(bodies[2], bodies[1], model), bodies[1], model.hearThreshold).ticks - 1;
    const hear = (/** @type {number} */ slack) => cell(Math.min(slack, audible), model);
    if (!completes({})) {
        return { hear: hear(SLACK_CAP), turn: none, run: cell(null, model), intercept };
    }
    return {
        hear: hear(slackOf(completes, 'hear')),
        turn: cell(slackOf(completes, 'turn'), model),
        run: cell(slackOf(completes, 'run'), model),
        intercept,
    };
}

/**
 * @param {Bodies} bodies the hunter, the caller and the defender
 * @param {Model} model the model options
 * @returns {DefendBudget['repel']} the shove: on or off, whether it delays the kill, and the bite energy that delay prevents
 */
function repelOf(bodies, model) {
    const [hunter, caller, defender] = bodies;
    const alone = playDefence(bodies, model, { absent: true });
    const run = playDefence(bodies, model);
    const later = run.killTick === null || (alone.killTick !== null && run.killTick > alone.killTick);
    const { energy, cost, impulse } = defender.repel;
    return {
        on: repelOn(defender),
        breaksBite: repelOn(defender) && later,
        energy,
        cost,
        impulse,
        prevented: Math.max(0, alone.bites - run.bites) * hunter.bite.damage * caller.bite.taken,
    };
}

/**
 * The defender's budget against a hunter closing on a caller (a standing forager, reproducer or scout): the cells hear,
 * turn, run, intercept and smoke. With the shove off (`defenderRepelEnergy` and `defenderRepelImpulse` both 0, the default)
 * the defender has no power on arrival, the intercept cell is impossible and the row's binding is `repel: off`.
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} caller the caller
 * @param {Model} model the model options
 * @returns {DefendBudget} the budget
 */
export function budgetDefend(defender, hunter, caller, model) {
    const bodies = [hunter, caller, defender];
    const smoke = defenderSmokeGeometry(bodies, model);
    const cells = { ...stepCells(bodies, model), smoke: smoke.cell };
    const row = rowOf(`defender:${hunter.spec}`, cells);
    const repel = repelOf(bodies, model);
    const kick = hunter.bite.cost * (defender.size / hunter.size) * (0.5 + defender.energy / defender.sizing.max);
    const binding = repel.on ? row.binding : 'repel: off';
    return {
        row: { ...row, binding },
        cells,
        repel,
        run: playDefence(bodies, model),
        baseline: playDefence(bodies, model, { absent: true }),
        smoke,
        defenderBite: { taken: hunter.bite.damage * defender.bite.taken, kick: kick * defender.bite.kick },
        binding,
    };
}
