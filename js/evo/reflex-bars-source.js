// The record of where one reflex bar comes from (brain-reflex-tests.md, T22): the bar's path, its value, whether a role-budget
// row, a config rule or a hand-set number gave it, and the row's status. Pure.

/**
 * @typedef {object} BarSource where one bar comes from
 * @property {string} bar the bar's path in `ReflexBars` (`role.turnAway.forager`)
 * @property {number} value the bar's value
 * @property {'budget' | 'config' | 'hand-set'} source a derivation from a row, from a config rule, or a number set by hand
 * @property {string} row the role-budget row the bar reads or would read
 * @property {string} rowStatus that row's status at this config (`ok`, `tight`, `impossible`, `n/a`) or `not built`
 * @property {string} note the step read, or why the bar is hand-set
 */

/**
 * @param {string} bar the bar's path
 * @param {number} value its value
 * @param {Partial<BarSource>} from the rest of the record
 * @returns {BarSource} the record
 */
export const source = (bar, value, from) => ({
    bar,
    value,
    source: 'hand-set',
    row: '',
    rowStatus: 'not built',
    note: '',
    ...from,
});
