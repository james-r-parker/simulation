// The bars of the reflex cases (brain-reflex-tests.md, Phase 5 and T22): every threshold a case's `check` reads, in one
// place, each with where it comes from. A bar is derived from a row of the role budget (docs/designs/role-budget.md) when
// the row exists and is not impossible (`reflex-bars-derived.js`); otherwise it is the hand-set number a case always had,
// labelled with the row's status, and the case's reference passes or fails it as before (`evalCase`). A bar from an
// impossible row is never invented. Pure: it reads the validated config and the model options.

import { createConfig, rulesHash } from '../sim/config.js';
import { SPEC_NAMES } from '../sim/specs.js';
import { matrix } from './role-budget-matrix.js';
import { validateModel } from './role-budget-model.js';
import { herdBars, turnAwayBars } from './reflex-bars-derived.js';
import { HAND_SET, NO_ROW } from './reflex-bars-hand.js';
import { source } from './reflex-bars-source.js';

/** The rows the bars read, built once per config. */
const ROWS = Object.freeze([
    'scout:predator',
    'defender:predator',
    'predator:forager',
    ...SPEC_NAMES.map((s) => `${s}:herd`),
]);

/** @typedef {import('./reflex-bars-source.js').BarSource} BarSource */

/**
 * @typedef {object} ReflexBars
 * @property {Record<string, number>} forager the forager cases' thresholds
 * @property {{turn: number, thrust: number, bite: number}} predator the predator cases' thresholds
 * @property {{turn: number, thrust: number, bite: number, herdTurn: Record<string, number>, herdThrust: Record<string, number>,
 *   alarm: number, sprint: {far: number, mid: number, near: number}, turnAway: Record<string, number>}} role the role cases'
 *   thresholds; `turnAway` is the turn of a flight, `herdTurn` and `herdThrust` the turn and the thrust to clear a herd, each
 *   by spec
 * @property {readonly BarSource[]} sources where each bar comes from
 */

/** @type {Map<string, Readonly<ReflexBars>>} the bars by rules hash and model */
const MEMO = new Map();

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {Record<string, import('./role-budget-matrix.js').Row>} the built rows by name
 */
function rowsOf(config, model) {
    return Object.fromEntries(matrix(config, model, ROWS).rows.map((row) => [row.name, row]));
}

/**
 * @param {Record<string, import('./role-budget-matrix.js').Row>} rows the built rows
 * @param {number} alarm the config's `alarmThreshold`
 * @returns {BarSource[]} the sources of the bars no derivation reaches: the config's alarm, the rows that are red, the bars
 *   no row reads
 */
function otherSources(rows, alarm) {
    const red = (/** @type {string} */ bar, /** @type {number} */ value, /** @type {string} */ row) =>
        source(bar, value, {
            row,
            rowStatus: rows[row].status,
            note: `the row is ${rows[row].status} at the defaults: no bar is derived from it; hand-set, the reference's result is reported`,
        });
    const unread = NO_ROW.map(({ bar, value, why }) =>
        source(bar, value, { rowStatus: 'n/a', note: `${why}; hand-set` }),
    );
    return [
        source('role.alarm', alarm, {
            source: 'config',
            row: 'scout:predator',
            rowStatus: rows['scout:predator'].status,
            note: 'the call output the sim fires above (`alarmThreshold`), the `warn` step',
        }),
        red('role.turn', HAND_SET.role.turn, 'defender:predator'),
        red('predator.turn', HAND_SET.predator.turn, 'predator:forager'),
        red('predator.thrust', HAND_SET.predator.thrust, 'predator:forager'),
        ...Object.entries(HAND_SET.role.sprint).map(([when, value]) =>
            red(`role.sprint.${when}`, value, 'predator:forager'),
        ),
        red('role.bite', HAND_SET.role.bite, 'predator:forager'),
        ...unread,
    ];
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, unknown>} [modelOptions] overrides of the role-budget model's defaults
 * @returns {Readonly<ReflexBars>} the bars at this config; a change to a config rule or model option that moves a row
 *   moves the bars derived from it
 */
export function reflexBars(config, modelOptions = {}) {
    const model = validateModel(modelOptions);
    const key = `${rulesHash(config)}:${JSON.stringify(model)}`;
    const memo = MEMO.get(key);
    if (memo !== undefined) {
        return memo;
    }
    const rows = rowsOf(config, model);
    const away = turnAwayBars(config, model, rows['scout:predator']);
    const herd = herdBars(config, rows, { specs: [...SPEC_NAMES], reaction: model.reactionTicks });
    const bars = Object.freeze({
        forager: HAND_SET.forager,
        predator: HAND_SET.predator,
        role: Object.freeze({
            ...HAND_SET.role,
            alarm: config.alarmThreshold,
            herdTurn: Object.freeze(herd.herdTurn),
            herdThrust: Object.freeze(herd.herdThrust),
            turnAway: Object.freeze(
                Object.fromEntries(SPEC_NAMES.map((n) => [n, away.turnAway[n] ?? HAND_SET.role.turn])),
            ),
        }),
        sources: Object.freeze([...away.sources, ...herd.sources, ...otherSources(rows, config.alarmThreshold)]),
    });
    MEMO.set(key, bars);
    return bars;
}

/** @returns {Readonly<ReflexBars>} the bars at the default config and model, which a case's `check` reads without a given set */
export const defaultBars = () => reflexBars(createConfig());
