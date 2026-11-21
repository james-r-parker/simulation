// The matrix of the role budget (docs/designs/role-budget.md, "The matrix"): the rows of the built phases, each a set of
// cells with a status and a binding step. Pure: it takes a validated config and the model options.

import { rulesHash } from '../sim/config.js';
import { PREY_SPECS, budgetChase } from './role-budget-chase.js';
import { normaliseMix, targetChoice } from './role-budget-choice.js';
import { roleParams } from './role-budget-params.js';

export { cell, rowOf } from './role-budget-cell.js';

/** The rows Phase 1 builds, in the order of the matrix. */
export const PHASE1_ROWS = Object.freeze([
    ...PREY_SPECS.map((s) => `predator:${s}`),
    'predator:average',
    'predator:best',
]);

/** @typedef {ReturnType<typeof import('./role-budget-cell.js').rowOf> & {detail?: any, picks?: string}} Row */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {readonly string[]} [rows] the rows to build (default every row of the built phases)
 * @param {{mix?: Record<string, number>}} [options] the weights of the `predator:average` row
 * @returns {{rows: Row[], model: import('./role-budget-model.js').RoleModel, rulesHash: string,
 *   choice: ReturnType<typeof targetChoice> | null}} the rows, the model they were built with, the rules hash of the
 *   config, and the target choice when a row asked for it
 * @throws {Error} on a row that is not built
 */
export function matrix(config, model, rows = PHASE1_ROWS, { mix } = {}) {
    for (const name of rows) {
        if (!PHASE1_ROWS.includes(name)) {
            throw new Error(`role-budget: unknown row "${name}"; built: ${PHASE1_ROWS.join(', ')}`);
        }
    }
    const hunter = roleParams(config, 'predator');
    const wantsChoice = rows.some((name) => name === 'predator:average' || name === 'predator:best');
    const needed = wantsChoice ? PREY_SPECS : PREY_SPECS.filter((s) => rows.includes(`predator:${s}`));
    const budgets = Object.fromEntries(needed.map((s) => [s, budgetChase(hunter, roleParams(config, s), model)]));
    const choice = wantsChoice
        ? targetChoice(config, model, mix === undefined ? undefined : normaliseMix(mix), budgets)
        : null;
    const built = rows.map((name) => {
        if (name === 'predator:average') {
            return { ...(choice?.average ?? {}), detail: choice };
        }
        if (name === 'predator:best') {
            return { ...(choice?.best ?? {}), detail: choice };
        }
        const budget = budgets[name.slice('predator:'.length)];
        return { ...budget.row, detail: budget };
    });
    return { rows: /** @type {Row[]} */ (built), model, rulesHash: rulesHash(config), choice };
}
