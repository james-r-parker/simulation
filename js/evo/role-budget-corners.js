// The matrix at the corners of the trait menus (docs/designs/body-genes.md, "The calculator reads the menu"): a row of the
// role budget read with the performer and the pressure at chosen corners. The performer is the spec named first in the row,
// the pressure the spec named second (a row whose second name is not a spec, such as `predator:average`, has no pressure
// body). Pure; every effect is off, the corners being the defaults plus the trait ratios.

import { SPEC_NAMES } from '../sim/specs.js';
import { bakeTraits, traitCorners } from './role-budget-genes.js';
import { matrix } from './role-budget-matrix.js';

/** The most corner pairs one row reads; the budget traits are seven, so a menu this wide is a menu to narrow. */
export const MAX_PAIRS = 4096;

/** @typedef {Record<string, number>} Ratios a ratio per trait */

/**
 * @typedef {object} CornerPick
 * @property {number | null} margin the slack in ticks, null when the step is impossible
 * @property {Ratios} performer the performer's trait ratios at that corner
 * @property {Ratios} pressure the pressure's trait ratios at that corner ({} with none)
 */

/**
 * @typedef {object} CornerRead
 * @property {string} row the row
 * @property {number} pairs how many corner pairs were read
 * @property {Record<string, {min: CornerPick, max: CornerPick}>} cells for each step, the least and the most slack and the corner that gives each
 */

/**
 * @typedef {object} Reading
 * @property {Readonly<Record<string, any>>} config the validated config the rows read
 * @property {Readonly<Record<string, any>>} worldConfig the config the rows of Phase 4 read the world from
 * @property {import('./role-budget-model.js').RoleModel} model the model options
 * @property {Record<string, number>} [mix] the weights of the `predator:average` row
 */

/**
 * @param {import('./role-budget-matrix.js').Row} row a row
 * @returns {number} its least slack in ticks, -Infinity when a step is impossible (Infinity with no step)
 */
export function slackOf(row) {
    const margins = Object.values(row.cells)
        .filter((c) => c.status !== 'n/a')
        .map((c) => (c.margin === null ? -Infinity : c.margin));
    return Math.min(...margins);
}

/**
 * @param {string} row a row name
 * @returns {{performer: string, pressure: string | null}} the specs it names
 */
export function bodiesOf(row) {
    const [performer, other] = row.split(':');
    return { performer, pressure: SPEC_NAMES.includes(other) && other !== performer ? other : null };
}

/**
 * @param {Reading} reading the config, the world config and the model
 * @param {string} name the row
 * @param {{performer: Ratios, pressure: Ratios}} corners the two bodies' ratios
 * @returns {import('./role-budget-matrix.js').Row} the row with the bodies at those corners
 */
export function rowAt({ config, worldConfig, model, mix }, name, corners) {
    const { performer, pressure } = bodiesOf(name);
    const bySpec = { [performer]: corners.performer, ...(pressure === null ? {} : { [pressure]: corners.pressure }) };
    return matrix(bakeTraits(config, bySpec), model, [name], { mix, worldConfig: bakeTraits(worldConfig, bySpec) })
        .rows[0];
}

/**
 * @param {Reading} reading the reading
 * @param {string} name the row
 * @returns {{performers: Ratios[], pressures: Ratios[]}} the corners of each body (one empty corner for a body with no menu
 *   open, and for a row with no pressure body)
 */
function cornersOf({ config }, name) {
    const { performer, pressure } = bodiesOf(name);
    return {
        performers: traitCorners(config, performer),
        pressures: pressure === null ? [{}] : traitCorners(config, pressure),
    };
}

/**
 * @param {CornerRead['cells']} cells the cells so far
 * @param {string} step a step
 * @param {CornerPick} pick a corner's reading of it
 * @returns {void}
 */
function keep(cells, step, pick) {
    const value = pick.margin ?? -Infinity;
    const held = cells[step];
    if (held === undefined) {
        cells[step] = { min: pick, max: pick };
        return;
    }
    if (value < (held.min.margin ?? -Infinity)) {
        held.min = pick;
    }
    if (value > (held.max.margin ?? -Infinity)) {
        held.max = pick;
    }
}

/**
 * Reads every cell of a row over every pair of corners.
 * @param {Reading} reading the reading
 * @param {string} name the row
 * @returns {CornerRead} the least and the most slack of each cell and the corner that gives each
 * @throws {Error} when the pairs exceed `MAX_PAIRS`
 */
export function readCorners(reading, name) {
    const { performers, pressures } = cornersOf(reading, name);
    const pairs = performers.length * pressures.length;
    if (pairs > MAX_PAIRS) {
        throw new Error(`${name}: ${pairs} corner pairs; narrow a menu (at most ${MAX_PAIRS})`);
    }
    /** @type {CornerRead['cells']} */
    const cells = {};
    for (const performer of performers) {
        for (const pressure of pressures) {
            const row = rowAt(reading, name, { performer, pressure });
            for (const [step, c] of Object.entries(row.cells).filter(([, cell]) => cell.status !== 'n/a')) {
                keep(cells, step, { margin: c.margin, performer, pressure });
            }
        }
    }
    return { row: name, pairs, cells };
}

/**
 * @param {Ratios[]} list corners
 * @param {(corner: Ratios) => number} slack a corner's slack
 * @param {boolean} most whether to pick the corner with the most slack (else the least)
 * @returns {Ratios} the first corner with the most (least) slack
 */
function pickBy(list, slack, most) {
    const values = list.map(slack);
    return list[values.indexOf(most ? Math.max(...values) : Math.min(...values))];
}

/**
 * @param {Reading} reading the reading
 * @param {string} name the row
 * @param {'best-vs-worst' | 'worst-vs-best'} mode the performer at its best corner against the pressure at its worst, or the reverse
 * @returns {{row: import('./role-budget-matrix.js').Row, performer: Ratios, pressure: Ratios}} the row read there: the
 *   performer's corner is the one with the most (least) slack against the default pressure, the pressure's the one that
 *   leaves the default performer the least (most)
 */
export function readExtremes(reading, name, mode) {
    const { performers, pressures } = cornersOf(reading, name);
    const best = mode === 'best-vs-worst';
    const performer = pickBy(performers, (c) => slackOf(rowAt(reading, name, { performer: c, pressure: {} })), best);
    const pressure = pickBy(pressures, (c) => slackOf(rowAt(reading, name, { performer: {}, pressure: c })), !best);
    return { row: rowAt(reading, name, { performer, pressure }), performer, pressure };
}
