// The bars a role-budget row gives (brain-reflex-tests.md, T22): the turn a body needs to be away in time, and the turn and
// the thrust it needs to clear a herd. Each is read from the row's own step and its slack; a row that is impossible or that
// does not read the body gives none, and the caller keeps the hand-set number labelled with the row's status, so no bar
// is ever invented. Pure: it reads the validated config and the built rows.

import { clearTicks } from './role-budget-herd.js';
import { swingTicks } from './role-budget-kinematics.js';
import { roleParams } from './role-budget-params.js';
import { FORAGER_TURN, budgetWarn } from './role-budget-warn.js';
import { HAND_SET } from './reflex-bars-hand.js';
import { source } from './reflex-bars-source.js';

/** The share of the `TURN` range the least-thrust bisection starts from, so a bar is never derived from a stalled body. */
const LEAST_SHARE = 0.01;
/** Bisection steps on the thrust share. */
const BISECT_STEPS = 24;

/**
 * The share of the `TURN` range a body needs to turn through an angle inside a step's slack: at full rate the swing takes
 * `swing` ticks, the body may spend `margin` more, so its rate must be at least the swing over the swing plus the slack.
 * @param {number} swing the ticks the swing takes at full rate
 * @param {number} margin the ticks of slack the row's turn step leaves
 * @returns {number} the share, in (0, 1]
 */
export const turnShare = (swing, margin) => swing / (Math.ceil(swing) + margin);

/**
 * @param {import('./role-budget-cell.js').Cell | undefined} turn a row's `turn` cell
 * @returns {boolean} whether it has slack to read
 */
const readable = (turn) =>
    turn !== undefined && turn.status !== 'impossible' && turn.status !== 'n/a' && turn.margin !== null;

/**
 * @param {string} bar the bar's path
 * @param {string} spec the body's name
 * @param {import('./role-budget-matrix.js').Row} row the row it reads
 * @param {string} step what the bar reads of the row
 * @returns {import('./reflex-bars-source.js').BarSource} the record of a bar derived from the row's step
 */
const derivedFrom = (bar, spec, row, step) =>
    source(bar, 0, { source: 'budget', row: row.name, rowStatus: row.status, note: `${spec}: ${step}` });

/**
 * The turn of a flight, for the forager (the row `scout:predator`) and the reproducer standing in the forager's place
 * (`budgetWarn` with it as the warned body): pi/2 at the body's turn rate over the swing plus the turn step's slack.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {import('./role-budget-matrix.js').Row} scoutRow the built row `scout:predator`
 * @returns {{turnAway: Record<string, number>, sources: import('./reflex-bars-source.js').BarSource[]}} the shares by spec,
 *   hand-set (`role.turn`) where the row gave none, and one record each
 */
export function turnAwayBars(config, model, scoutRow) {
    const { row: reproducerRow } = budgetWarn(
        roleParams(config, 'scout'),
        roleParams(config, 'reproducer'),
        roleParams(config, 'predator'),
        model,
    );
    /** @type {Record<string, number>} */
    const turnAway = {};
    const sources = [
        /** @type {const} */ (['forager', scoutRow]),
        /** @type {const} */ (['reproducer', reproducerRow]),
    ].map(([spec, row]) => {
        const bar = `role.turnAway.${spec}`;
        if (!readable(row.cells.turn)) {
            turnAway[spec] = HAND_SET.role.turn;
            const note =
                'the row has no turn slack to read at this config (the turn step is impossible or unread); hand-set';
            return source(bar, HAND_SET.role.turn, { row: row.name, rowStatus: row.status, note });
        }
        const margin = /** @type {number} */ (row.cells.turn.margin);
        const swing = swingTicks(FORAGER_TURN, roleParams(config, spec).turnRate.start);
        turnAway[spec] = turnShare(swing, margin);
        const note = `turn step: pi/2 at the ${spec}'s turn rate with ${margin} ticks of slack`;
        return { ...derivedFrom(bar, spec, row, note), value: turnAway[spec] };
    });
    return { turnAway, sources };
}

/**
 * The least share of the cruise thrust that clears the herd's half-width inside the ticks left after the reaction and the
 * turn (`clearTicks` falls as the share rises).
 * @param {import('./role-budget-params.js').RoleParams} p the body
 * @param {{half: number, warning: number, turn: number}} worst the body's worst case against the herd
 * @param {number} reaction the model's `reactionTicks`
 * @returns {number | null} the share, null when even the full cruise thrust takes longer (the row's run is then met by the
 *   sprint gait, which is not a share of `THRUST`)
 */
export function leastCruiseShare(p, worst, reaction) {
    const left = worst.warning - reaction - worst.turn;
    const clears = (/** @type {number} */ s) =>
        clearTicks(
            { ...p, thrust: { ...p.thrust, cruise: p.thrust.cruise * s } },
            { distance: worst.half, sprint: false },
        ) <= left;
    if (!clears(1)) {
        return null;
    }
    let [lo, hi] = [LEAST_SHARE, 1];
    for (let i = 0; i < BISECT_STEPS; i++) {
        const mid = (lo + hi) / 2;
        [lo, hi] = clears(mid) ? [lo, mid] : [mid, hi];
    }
    return hi;
}

/**
 * @param {string} spec the body's name
 * @param {import('./role-budget-matrix.js').Row} row its row `<spec>:herd`
 * @returns {string} why the row gives no bar
 */
const herdWhy = (spec, row) =>
    row.status === 'n/a'
        ? `${spec} can hunt: the herd turns from it, so the row reads no step; hand-set`
        : `the row is ${row.status} at this config: no bar is derived from it; hand-set, the reference's result is reported`;

/**
 * The turn and the thrust to clear a herd, for each spec whose row `<spec>:herd` is built and not impossible.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, import('./role-budget-matrix.js').Row>} rows the built rows by name
 * @param {{specs: string[], reaction: number}} read the specs and the model's `reactionTicks`
 * @returns {{herdTurn: Record<string, number>, herdThrust: Record<string, number>,
 *   sources: import('./reflex-bars-source.js').BarSource[]}} the bars by spec and one record each
 */
export function herdBars(config, rows, { specs, reaction }) {
    /** @type {Record<string, number>} */
    const herdTurn = {};
    /** @type {Record<string, number>} */
    const herdThrust = {};
    const sources = specs.flatMap((spec) => {
        const row = rows[`${spec}:herd`];
        const [turnBar, thrustBar] = [`role.herdTurn.${spec}`, `role.herdThrust.${spec}`];
        herdTurn[spec] = HAND_SET.role.herdTurn;
        herdThrust[spec] = HAND_SET.role.herdThrust;
        const hand = (/** @type {string} */ bar, /** @type {number} */ value, /** @type {string} */ note) =>
            source(bar, value, { row: row.name, rowStatus: row.status, note });
        if (row.status === 'n/a' || row.status === 'impossible' || !readable(row.cells.turn)) {
            const why = herdWhy(spec, row);
            return [hand(turnBar, HAND_SET.role.herdTurn, why), hand(thrustBar, HAND_SET.role.herdThrust, why)];
        }
        const { worst } = /** @type {any} */ (row).detail;
        herdTurn[spec] = turnShare(worst.turn, /** @type {number} */ (row.cells.turn.margin));
        const share = leastCruiseShare(roleParams(config, spec), worst, reaction);
        const turned = {
            ...derivedFrom(
                turnBar,
                spec,
                row,
                `turn step: the flank turn at the ${spec}'s turn rate with ${row.cells.turn.margin} ticks of slack`,
            ),
            value: herdTurn[spec],
        };
        if (share === null) {
            const note =
                'the cruise gait cannot clear the herd in time (the row is met by the sprint gait, which is not a share of THRUST); hand-set';
            return [turned, hand(thrustBar, HAND_SET.role.herdThrust, note)];
        }
        herdThrust[spec] = share;
        const note = `run step: the least share of the ${spec}'s cruise thrust that clears the herd's half-width in the ticks left`;
        return [turned, { ...derivedFrom(thrustBar, spec, row, note), value: share }];
    });
    return { herdTurn, herdThrust, sources };
}
