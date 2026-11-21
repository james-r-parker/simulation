// The pack row of the role budget (docs/designs/role-budget.md, "The matrix"; docs/designs/status-effects.md T13): two
// hunters against one forager, the caller alone and the hearer rallied by the caller's hunt call, and `packGain`, the pack's
// catch margin minus a lone hunter's. The row is an amplifier, never a gate: every other row is read with every effect off,
// because a job that needs a buff can never be learned from scratch ("Every row is gated with every effect off"), and this
// one is read with the levels a pack would have. At the neutral numbers (`rallyThrust` 0 and `rallyBurn` 0) a rally changes
// no lane, so the hearer is the lone hunter and `packGain` is 0 by construction. Pure.

import { budgetChase } from './role-budget-chase.js';
import { roleParams } from './role-budget-params.js';

/** The rows that amplify the gated ones: read beside the matrix with effects on, never part of the gate. */
export const AMPLIFIER_ROWS = Object.freeze(['pack:forager']);

/** The levels a pack has: the hearer of one hunt call holds one stack of `rallied`. */
export const PACK_LEVELS = Object.freeze({ rallied: 1 });

/**
 * @typedef {object} PackBudget
 * @property {import('./role-budget-chase.js').ChaseBudget['row']} row the matrix row of the pack's better hunter: the four steps of the chase
 * @property {import('./role-budget-chase.js').ChaseBudget} lone the caller's chase, every effect off
 * @property {import('./role-budget-chase.js').ChaseBudget} rallied the hearer's chase, at `levels`
 * @property {number} packGain the pack's catch margin minus a lone hunter's, in px: the better of the two hunters' broken-bound
 *   margins less the lone hunter's, so it is never below 0; 0 when the rally changes no lane
 * @property {number} packGainTicks `packGain` in ticks of the lone hunter's sprint, the unit of `tightTicks`
 * @property {number} burn the energy the hearer spends in the chase less the caller's: the rally's burn, less what a faster closing saves
 * @property {Readonly<Record<string, number>>} levels the effect levels of the hearer
 */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{hunter?: string, prey?: string, levels?: Readonly<Record<string, number>>}} [options] the hunter and prey specs
 *   (`predator` and `forager`) and the hearer's effect levels (`PACK_LEVELS`)
 * @returns {PackBudget} the pack's budget
 */
export function budgetPack(config, model, { hunter = 'predator', prey = 'forager', levels = PACK_LEVELS } = {}) {
    const preyParams = roleParams(config, prey);
    const loneParams = roleParams(config, hunter);
    const lone = budgetChase(loneParams, preyParams, model, { bearings: false });
    const heard = budgetChase(roleParams(config, hunter, {}, { effects: { ...levels } }), preyParams, model, {
        bearings: false,
    });
    const better = heard.catchMargin > lone.catchMargin ? heard : lone;
    const packGain = better.catchMargin - lone.catchMargin;
    return {
        row: { ...better.row, name: 'pack:forager' },
        lone,
        rallied: heard,
        packGain,
        packGainTicks: packGain / loneParams.cap.sprint,
        burn: heard.chaseEnergy.spent - lone.chaseEnergy.spent,
        levels,
    };
}
