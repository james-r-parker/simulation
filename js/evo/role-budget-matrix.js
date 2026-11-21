// The matrix of the role budget (docs/designs/role-budget.md, "The matrix"): the rows of the built phases, each a set of
// cells with a status and a binding step. Pure: it takes a validated config and the model options.

import { rulesHash } from '../sim/config.js';
import { PREY_SPECS, budgetChase } from './role-budget-chase.js';
import { normaliseMix, targetChoice } from './role-budget-choice.js';
import { budgetDefend } from './role-budget-defend.js';
import { budgetWarn } from './role-budget-warn.js';
import { budgetHerd } from './role-budget-herd.js';
import { PHASE4_ROWS, phase4Budget, preysFor } from './role-budget-matrix-thrive.js';
import { SPEC_NAMES } from '../sim/specs.js';
import { roleParams } from './role-budget-params.js';

export { cell, rowOf } from './role-budget-cell.js';

/** The rows Phase 1 builds, in the order of the matrix. */
export const PHASE1_ROWS = Object.freeze([
    ...PREY_SPECS.map((s) => `predator:${s}`),
    'predator:average',
    'predator:best',
]);

/** The rows Phase 2 builds: the defender against the hunter, the forager standing as the caller. */
export const PHASE2_ROWS = Object.freeze(['defender:predator']);

/** The rows Phase 3 builds: the scout warning a forager of a hunter creeping up on it. */
export const PHASE3_ROWS = Object.freeze(['scout:predator']);

/** The rows Phase 5 builds: each spec against a stampeding herd. */
export const PHASE5_ROWS = Object.freeze(SPEC_NAMES.map((s) => `${s}:herd`));

export { PHASE4_ROWS };

/** Every row built, in the order of the matrix. */
export const BUILT_ROWS = Object.freeze([
    ...PHASE1_ROWS,
    ...PHASE2_ROWS,
    ...PHASE3_ROWS,
    ...PHASE4_ROWS,
    ...PHASE5_ROWS,
]);

/** @typedef {ReturnType<typeof import('./role-budget-cell.js').rowOf> & {detail?: any, picks?: string}} Row */

/**
 * @param {'defender:predator' | 'scout:predator'} name the row
 * @param {{config: Readonly<Record<string, any>>, hunter: import('./role-budget-params.js').RoleParams,
 *   model: import('./role-budget-model.js').RoleModel}} from the config, the hunter and the model
 * @returns {{row: Row} & Record<string, any>} the budget of the guild member against the hunter, the forager standing as
 *   the one it protects or warns
 */
function guildBudget(name, { config, hunter, model }) {
    const forager = roleParams(config, 'forager');
    return name === 'scout:predator'
        ? budgetWarn(roleParams(config, 'scout'), forager, hunter, model)
        : budgetDefend(roleParams(config, 'defender'), hunter, forager, model);
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {readonly string[]} [rows] the rows to build (default every row of the built phases)
 * @param {{mix?: Record<string, number>, worldConfig?: Readonly<Record<string, any>>}} [options] the weights of the
 *   `predator:average` row, and the config the rows of Phase 4 read the world from (the default world: the arena `config` is
 *   empty of food and agents; default `config`)
 * @returns {{rows: Row[], model: import('./role-budget-model.js').RoleModel, rulesHash: string,
 *   choice: ReturnType<typeof targetChoice> | null}} the rows, the model they were built with, the rules hash of the
 *   config, and the target choice when a row asked for it
 * @throws {Error} on a row that is not built
 */
export function matrix(config, model, rows = BUILT_ROWS, { mix, worldConfig = config } = {}) {
    for (const name of rows) {
        if (!BUILT_ROWS.includes(name)) {
            throw new Error(`role-budget: unknown row "${name}"; built: ${BUILT_ROWS.join(', ')}`);
        }
    }
    const hunter = roleParams(config, 'predator');
    const wantsChoice = rows.some((name) => name === 'predator:average' || name === 'predator:best');
    const needed = wantsChoice
        ? PREY_SPECS
        : PREY_SPECS.filter((s) => rows.includes(`predator:${s}`) || rows.some((r) => preysFor(r).includes(s)));
    const budgets = Object.fromEntries(needed.map((s) => [s, budgetChase(hunter, roleParams(config, s), model)]));
    const choice = wantsChoice
        ? targetChoice(config, model, mix === undefined ? undefined : normaliseMix(mix), budgets)
        : null;
    const choiceRow = (/** @type {'average' | 'best'} */ which) => ({
        .../** @type {any} */ (choice)[which],
        detail: choice,
    });
    const built = rows.map((name) => {
        if (name === 'defender:predator' || name === 'scout:predator') {
            const budget = guildBudget(name, { config, hunter, model });
            return { ...budget.row, detail: budget };
        }
        if (PHASE5_ROWS.includes(name)) {
            const budget = budgetHerd(worldConfig, roleParams(worldConfig, name.slice(0, name.indexOf(':'))), model);
            return { ...budget.row, detail: budget };
        }
        if (PHASE4_ROWS.includes(name)) {
            const budget = phase4Budget(name, { config: worldConfig, model, budgets, mix });
            return { ...budget.row, detail: budget };
        }
        if (name === 'predator:average' || name === 'predator:best') {
            return choiceRow(name === 'predator:average' ? 'average' : 'best');
        }
        const budget = budgets[name.slice('predator:'.length)];
        return { ...budget.row, detail: budget };
    });
    return { rows: /** @type {Row[]} */ (built), model, rulesHash: rulesHash(config), choice };
}
