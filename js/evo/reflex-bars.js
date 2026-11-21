// The bars of the reflex cases (brain-reflex-tests.md, Phase 5 and T22): every threshold a case's `check` reads, in one
// place, each with where it comes from. A bar is derived from a row of the role budget (docs/designs/role-budget.md) when
// the row exists and is not impossible; otherwise it is the hand-set number a case always had, labelled with the row's
// status, and the case's reference passes or fails it as before (`evalCase`). A bar from an impossible row is never invented.
// Pure: it reads the validated config and the model options.

import { createConfig, rulesHash } from '../sim/config.js';
import { SPEC_NAMES } from '../sim/specs.js';
import { swingTicks } from './role-budget-kinematics.js';
import { matrix } from './role-budget-matrix.js';
import { validateModel } from './role-budget-model.js';
import { roleParams } from './role-budget-params.js';
import { FORAGER_TURN } from './role-budget-warn.js';
import { HAND_SET, NO_ROW, TODO_ROWS } from './reflex-bars-hand.js';

/** The rows the bars read, built once per config. */
const ROWS = Object.freeze(['scout:predator', 'defender:predator', 'predator:forager']);

/**
 * @typedef {object} BarSource where one bar comes from
 * @property {string} bar the bar's path in `ReflexBars` (`role.turnAway.forager`)
 * @property {number} value the bar's value
 * @property {'budget' | 'config' | 'hand-set'} source a derivation from a row, from a config rule, or a number set by hand
 * @property {string} row the role-budget row the bar reads or would read
 * @property {string} rowStatus that row's status at this config (`ok`, `tight`, `impossible`) or `not built`
 * @property {string} note the step read, or why the bar is hand-set
 */

/**
 * @typedef {object} ReflexBars
 * @property {Record<string, number>} forager the forager cases' thresholds
 * @property {{turn: number, thrust: number, bite: number}} predator the predator cases' thresholds
 * @property {{turn: number, thrust: number, bite: number, herdTurn: number, herdThrust: number, alarm: number, sprint: {far: number, mid: number, near: number},
 *   turnAway: Record<string, number>}} role the role cases' thresholds; `turnAway` is the turn of a flight, by spec
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
 * The share of the `TURN` range a forager needs to turn away through `FORAGER_TURN` inside the turn step's slack: at full
 * rate the swing takes `swingTicks`, the forager may spend `slack` more ticks, so its rate must be at least the swing over
 * the swing plus the slack.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-matrix.js').Row} row the row `scout:predator`
 * @returns {number | null} the share, null when the row's turn step has no slack to read
 */
function foragerTurnAway(config, row) {
    const turn = row.cells.turn;
    if (turn === undefined || turn.status === 'impossible' || turn.status === 'n/a' || turn.margin === null) {
        return null;
    }
    const swing = swingTicks(FORAGER_TURN, roleParams(config, 'forager').turnRate.start);
    return swing / (Math.ceil(swing) + turn.margin);
}

/**
 * @param {string} bar the bar's path
 * @param {number} value its value
 * @param {Partial<BarSource>} from the rest of the record
 * @returns {BarSource} the record
 */
const source = (bar, value, from) => ({
    bar,
    value,
    source: 'hand-set',
    row: '',
    rowStatus: 'not built',
    note: '',
    ...from,
});

/**
 * @param {Record<string, import('./role-budget-matrix.js').Row>} rows the built rows
 * @param {string} name a row name
 * @returns {string} its status
 */
const statusOf = (rows, name) => rows[name].status;

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, import('./role-budget-matrix.js').Row>} rows the built rows
 * @returns {{turnAway: number, sources: BarSource[]}} the forager's turn away, derived when its row allows
 */
function turnAwayOf(config, rows) {
    const derived = foragerTurnAway(config, rows['scout:predator']);
    const bar = 'role.turnAway.forager';
    if (derived === null) {
        const note =
            'the row has no turn slack to read at this config (the turn step is impossible or unread); hand-set';
        return {
            turnAway: HAND_SET.role.turn,
            sources: [
                source(bar, HAND_SET.role.turn, {
                    row: 'scout:predator',
                    rowStatus: statusOf(rows, 'scout:predator'),
                    note,
                }),
            ],
        };
    }
    const note = `turn step: pi/2 at the forager's turn rate with ${rows['scout:predator'].cells.turn.margin} ticks of slack`;
    return {
        turnAway: derived,
        sources: [
            source(bar, derived, {
                source: 'budget',
                row: 'scout:predator',
                rowStatus: statusOf(rows, 'scout:predator'),
                note,
            }),
        ],
    };
}

/**
 * @param {Record<string, import('./role-budget-matrix.js').Row>} rows the built rows
 * @param {number} alarm the config's `alarmThreshold`
 * @returns {BarSource[]} the sources of the bars no derivation reaches: the config's alarm, the rows that are red, the rows
 *   that are not built yet
 */
function otherSources(rows, alarm) {
    const red = (/** @type {string} */ bar, /** @type {number} */ value, /** @type {string} */ row) =>
        source(bar, value, {
            row,
            rowStatus: statusOf(rows, row),
            note: `the row is ${statusOf(rows, row)} at the defaults: no bar is derived from it; hand-set, the reference's result is reported`,
        });
    const todo = TODO_ROWS.map(({ bar, value, row, pr }) =>
        source(bar, value, { row, note: `TODO: derive from row ${row} when it lands (${pr}); hand-set until then` }),
    );
    const unread = NO_ROW.map(({ bar, value, why }) =>
        source(bar, value, { rowStatus: 'n/a', note: `${why}; hand-set` }),
    );
    return [
        source('role.alarm', alarm, {
            source: 'config',
            row: 'scout:predator',
            rowStatus: statusOf(rows, 'scout:predator'),
            note: 'the call output the sim fires above (`alarmThreshold`), the `warn` step',
        }),
        red('role.turn', HAND_SET.role.turn, 'defender:predator'),
        red('predator.turn', HAND_SET.predator.turn, 'predator:forager'),
        red('predator.thrust', HAND_SET.predator.thrust, 'predator:forager'),
        ...Object.entries(HAND_SET.role.sprint).map(([when, value]) =>
            red(`role.sprint.${when}`, value, 'predator:forager'),
        ),
        red('role.bite', HAND_SET.role.bite, 'predator:forager'),
        ...todo,
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
    const { turnAway, sources } = turnAwayOf(config, rows);
    const reproducer = HAND_SET.role.turn;
    const bars = Object.freeze({
        forager: HAND_SET.forager,
        predator: HAND_SET.predator,
        role: Object.freeze({
            ...HAND_SET.role,
            alarm: config.alarmThreshold,
            turnAway: Object.freeze(
                Object.fromEntries(SPEC_NAMES.map((n) => [n, n === 'forager' ? turnAway : reproducer])),
            ),
        }),
        sources: Object.freeze([...sources, ...otherSources(rows, config.alarmThreshold)]),
    });
    MEMO.set(key, bars);
    return bars;
}

/** @returns {Readonly<ReflexBars>} the bars at the default config and model, which a case's `check` reads without a given set */
export const defaultBars = () => reflexBars(createConfig());
