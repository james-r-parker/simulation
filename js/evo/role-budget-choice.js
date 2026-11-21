// The hunter that picks its target (docs/designs/role-budget.md, "The matrix"): the `predator:average` row of a hunter
// that cannot tell its targets apart, the `predator:best` row of one that can, and what telling them apart is worth.
// Pure: it reads the budgets of the four prey rows.

import { cell, rowOf } from './role-budget-cell.js';
import { PREY_SPECS, budgetChase } from './role-budget-chase.js';
import { roleParams } from './role-budget-params.js';

export { PREY_SPECS };

/** The steps of a hunter row. */
const STEPS = Object.freeze(['see', 'turn', 'run', 'bite']);

/** @type {Readonly<Record<string, number>>} equal weights: a seeded population draws its specialisation uniformly */
export const DEFAULT_MIX = Object.freeze(Object.fromEntries(PREY_SPECS.map((s) => [s, 0.25])));

/**
 * @param {Record<string, number>} mix weights by prey specialisation (any scale)
 * @returns {Record<string, number>} the weights scaled to sum to 1, a prey not named counting 0
 * @throws {Error} on a name that is not a prey row, a weight that is not a number of at least 0, or weights that sum to 0
 */
export function normaliseMix(mix) {
    for (const [name, weight] of Object.entries(mix)) {
        if (!PREY_SPECS.includes(name)) {
            throw new Error(`mix: "${name}" is not a prey row; known: ${PREY_SPECS.join(', ')}`);
        }
        if (!Number.isFinite(weight) || weight < 0) {
            throw new Error(`mix: the weight of "${name}" must be a number of at least 0, got ${weight}`);
        }
    }
    const total = Object.values(mix).reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
        throw new Error('mix: the weights sum to 0');
    }
    return Object.fromEntries(PREY_SPECS.map((s) => [s, (mix[s] ?? 0) / total]));
}

/**
 * @param {Record<string, import('./role-budget-cell.js').Cell>} cells a hunter row's cells
 * @returns {number} the row's slack in ticks: 0 when it is impossible, else the least slack of its steps
 */
export function rowSlack(cells) {
    const steps = Object.values(cells).filter((c) => c.status !== 'n/a');
    if (steps.some((c) => c.status === 'impossible')) {
        return 0;
    }
    return steps.length === 0 ? 0 : Math.min(...steps.map((c) => /** @type {number} */ (c.margin)));
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {Record<string, ReturnType<typeof budgetChase>>} the predator's budget against each prey row
 */
export function preyBudgets(config, model) {
    const hunter = roleParams(config, 'predator');
    return Object.fromEntries(
        PREY_SPECS.map((s) => [s, budgetChase(hunter, roleParams(config, s), model, { bearings: false })]),
    );
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {Record<string, number>} [mix] weights by prey row (default equal)
 * @param {Record<string, {cells: Record<string, import('./role-budget-cell.js').Cell>, row: {status: string}}>} [budgets] the
 *   budgets of the four prey rows, when the caller has them
 * @returns {{average: ReturnType<typeof rowOf>, best: ReturnType<typeof rowOf> & {picks: string}, catchableShare: number,
 *   choiceGain: number, mix: Record<string, number>}} the average row (each step the weighted mean of the prey rows, an
 *   impossible step counted as zero slack, every step impossible when no prey in the mix can be caught), the best row
 *   (the prey row of the largest slack, `picks` naming it), the mix share of prey the hunter can catch at all, and
 *   `choiceGain`: the best slack less the average's, in ticks
 */
export function targetChoice(config, model, mix = DEFAULT_MIX, budgets = preyBudgets(config, model)) {
    const weights = normaliseMix(mix);
    const margin = (/** @type {string} */ spec, /** @type {string} */ step) => {
        const c = budgets[spec].cells[step];
        if (budgets[spec].row.status === 'impossible') {
            return 0;
        }
        return c.status === 'n/a' ? null : (c.margin ?? 0);
    };
    const catchableShare = PREY_SPECS.filter((s) => budgets[s].row.status !== 'impossible').reduce(
        (sum, s) => sum + weights[s],
        0,
    );
    const cells = Object.fromEntries(
        STEPS.map((step) => {
            if (catchableShare === 0) {
                return [step, cell(null, model)];
            }
            const used = PREY_SPECS.filter((s) => weights[s] > 0 && margin(s, step) !== null);
            const weight = used.reduce((sum, s) => sum + weights[s], 0);
            const mean = used.reduce((sum, s) => sum + weights[s] * /** @type {number} */ (margin(s, step)), 0);
            return [step, cell(used.length === 0 ? undefined : mean / weight, model)];
        }),
    );
    const slacks = PREY_SPECS.map((s) => rowSlack(budgets[s].cells));
    const picks = PREY_SPECS[slacks.indexOf(Math.max(...slacks))];
    const average = rowOf('predator:average', cells);
    const best = rowOf('predator:best', structuredClone(budgets[picks].cells));
    return {
        average,
        best: { ...best, picks },
        catchableShare,
        choiceGain: Math.max(...slacks) - rowSlack(average.cells),
        mix: weights,
    };
}
