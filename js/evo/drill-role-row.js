// The bar of a role drill, read from its budget row (docs/designs/role-budget.md): the row the drill's scene is built from,
// at the config the trials run under, with the model at its defaults. A row the budget calls impossible has no passable bar,
// and the reading says so; the drill does not invent one. Pure; a closed form from the config, no world, no RNG.

import { MODEL_DEFAULTS } from './role-budget-model.js';
import { matrix } from './role-budget-matrix.js';

/** @type {WeakMap<object, Map<string, import('./role-budget-matrix.js').Row>>} rows by config object, so a trial's plan does not redo the search */
const MEMO = new WeakMap();

/**
 * @param {string} name the budget row (`defender:predator`, `scout:predator`)
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {import('./role-budget-matrix.js').Row} the row, with `detail` the guild budget (its scene's ticks and gaps)
 */
export function rowOf(name, config) {
    const rows = MEMO.get(config) ?? new Map();
    MEMO.set(config, rows);
    if (!rows.has(name)) {
        rows.set(name, matrix(config, MODEL_DEFAULTS, [name]).rows[0]);
    }
    return rows.get(name);
}

/**
 * @typedef {object} RowBar
 * @property {string} row the budget row
 * @property {'ok' | 'tight' | 'impossible' | 'n/a'} status the row's status
 * @property {string | null} binding the step with the least slack, or `repel: off` for a defender with no shove
 * @property {boolean} passable whether a perfect performer can win the scene: some goal of the drill has every one of its
 *   steps possible
 * @property {number | null} slackTicks the least slack, in ticks, of the steps of the best goal; null when not passable
 */

/**
 * @param {string} name the budget row
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {readonly (readonly string[])[]} [goals] the sets of steps by which the drill can be won: the drill is passable when
 *   every step of one of them is possible (default: one goal of all the row's steps, the row's own status)
 * @returns {RowBar} the bar the row sets
 */
export function barOf(name, config, goals) {
    const { status, binding, cells } = rowOf(name, config);
    const used = (/** @type {readonly string[]} */ steps) => steps.filter((step) => cells[step].status !== 'n/a');
    const sets = (goals ?? [Object.keys(cells)]).map(used).filter((steps) => steps.length > 0);
    const open = sets.filter((steps) => steps.every((step) => cells[step].status !== 'impossible'));
    const slacks = open.map((steps) => Math.min(...steps.map((step) => /** @type {number} */ (cells[step].margin))));
    return {
        row: name,
        status,
        binding,
        passable: open.length > 0,
        slackTicks: open.length > 0 ? Math.max(...slacks) : null,
    };
}
