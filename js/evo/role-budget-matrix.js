// The matrix of the role budget (docs/designs/role-budget.md, "The matrix"): the rows of the built phases, each a set of
// cells with a status and a binding step. Pure: it takes a validated config and the model options.

import { rulesHash } from '../sim/config.js';
import { PREY_SPECS, budgetChase } from './role-budget-chase.js';
import { roleParams } from './role-budget-params.js';

export { cell, rowOf } from './role-budget-cell.js';

/** The rows Phase 1 builds, in the order of the matrix. */
export const PHASE1_ROWS = Object.freeze(PREY_SPECS.map((s) => `predator:${s}`));

/** @typedef {ReturnType<typeof import('./role-budget-cell.js').rowOf> & {detail?: any, picks?: string}} Row */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {readonly string[]} [rows] the rows to build (default every row of the built phases)
 * @returns {{rows: Row[], model: import('./role-budget-model.js').RoleModel, rulesHash: string}} the rows, the model
 *   they were built with and the rules hash of the config
 * @throws {Error} on a row that is not built
 */
export function matrix(config, model, rows = PHASE1_ROWS) {
    for (const name of rows) {
        if (!PHASE1_ROWS.includes(name)) {
            throw new Error(`role-budget: unknown row "${name}"; built: ${PHASE1_ROWS.join(', ')}`);
        }
    }
    const hunter = roleParams(config, 'predator');
    const needed = PREY_SPECS.filter((s) => rows.includes(`predator:${s}`));
    const budgets = Object.fromEntries(needed.map((s) => [s, budgetChase(hunter, roleParams(config, s), model)]));
    const built = rows.map((name) => {
        const budget = budgets[name.slice('predator:'.length)];
        return { ...budget.row, detail: budget };
    });
    return { rows: /** @type {Row[]} */ (built), model, rulesHash: rulesHash(config) };
}
