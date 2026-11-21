// The hand-set bars of the reflex cases (brain-reflex-tests.md, T22): the numbers the cases carried before `reflexBars`
// (js/evo/reflex-bars.js) moved them. A bar stays here only while no role-budget row can give it: the row is red at the
// defaults, is not built yet, or reads no such quantity. Shares of the output range.

/** The thresholds, by case group. */
export const HAND_SET = Object.freeze({
    forager: Object.freeze({
        fleeThrust: 0.3,
        fleeBehindThrust: 0.5,
        behindDeg: 160,
        turn: 0.15,
        approachThrust: 0.1,
        aheadThrust: 0.3,
        aheadTurn: 0.5,
        avoidTurn: 0.2,
        stopThrust: 0.1,
        passThrust: 0.3,
        passTurn: 0.4,
        deadAheadDeg: 5,
    }),
    predator: Object.freeze({ turn: 0.15, thrust: 0.3, bite: 0 }),
    role: Object.freeze({
        turn: 0.15,
        thrust: 0.3,
        bite: 0,
        herdTurn: 0.15,
        herdThrust: 0.3,
        /** The `SPRINT` effort a prey in view asks for, by how near it is: higher as it nears. */
        sprint: Object.freeze({ far: 0.15, mid: 0.35, near: 0.55 }),
    }),
});

/**
 * The bars a role-budget row will give once it is built (open pull requests), still hand-set.
 * @type {readonly {bar: string, value: number, row: string, pr: string}[]}
 */
export const TODO_ROWS = Object.freeze([
    { bar: 'forager.fleeThrust', value: HAND_SET.forager.fleeThrust, row: 'forager:predator', pr: 'PR 602' },
    {
        bar: 'forager.fleeBehindThrust',
        value: HAND_SET.forager.fleeBehindThrust,
        row: 'forager:predator',
        pr: 'PR 602',
    },
    { bar: 'forager.turn (flee-threat)', value: HAND_SET.forager.turn, row: 'forager:predator', pr: 'PR 602' },
    { bar: 'role.turnAway.reproducer', value: HAND_SET.role.turn, row: 'reproducer:predator', pr: 'PR 602' },
    { bar: 'role.herdTurn', value: HAND_SET.role.herdTurn, row: '<spec>:herd', pr: 'PR 603' },
    { bar: 'role.herdThrust', value: HAND_SET.role.herdThrust, row: '<spec>:herd', pr: 'PR 603' },
]);

/**
 * The bars that no row reads: an eating bar (a forager's `eat` step has no row until Phase 4), a thrust share (the rows read
 * ticks and px, not a share of the thrust output) or a geometry tolerance.
 * @type {readonly {bar: string, value: number, why: string}[]}
 */
export const NO_ROW = Object.freeze([
    { bar: 'forager.approachThrust', value: HAND_SET.forager.approachThrust, why: 'an eating bar; no row reads it' },
    { bar: 'forager.aheadThrust', value: HAND_SET.forager.aheadThrust, why: 'an eating bar; no row reads it' },
    { bar: 'forager.aheadTurn', value: HAND_SET.forager.aheadTurn, why: 'a tolerance on a straight run; no row' },
    { bar: 'forager.avoidTurn', value: HAND_SET.forager.avoidTurn, why: 'an obstacle bar; no row reads it' },
    { bar: 'forager.stopThrust', value: HAND_SET.forager.stopThrust, why: 'an obstacle bar; no row reads it' },
    { bar: 'forager.passThrust', value: HAND_SET.forager.passThrust, why: 'an obstacle bar; no row reads it' },
    { bar: 'forager.passTurn', value: HAND_SET.forager.passTurn, why: 'an obstacle bar; no row reads it' },
    { bar: 'forager.behindDeg', value: HAND_SET.forager.behindDeg, why: 'the geometry where a turn side is a tie' },
    {
        bar: 'forager.deadAheadDeg',
        value: HAND_SET.forager.deadAheadDeg,
        why: 'the geometry where a turn side is a tie',
    },
    { bar: 'role.thrust', value: HAND_SET.role.thrust, why: 'the rows read ticks and px, not a thrust share' },
]);
