// The hand-set bars of the reflex cases (brain-reflex-tests.md, T22): the numbers the cases carried before `reflexBars`
// (js/evo/reflex-bars.js) moved them. A bar stays here only while no role-budget row can give it: the row is red at the
// defaults, reads no step of the body, or reads no such quantity. Shares of the output range.

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
        /** The fallback of `herdTurn` and `herdThrust` for a spec whose row `<spec>:herd` gives none. */
        herdTurn: 0.15,
        herdThrust: 0.3,
        /** The `SPRINT` effort a prey in view asks for, by how near it is: higher as it nears. */
        sprint: Object.freeze({ far: 0.15, mid: 0.35, near: 0.55 }),
    }),
});

/**
 * The bars that no row reads: an eating bar (no row reads what the forager eats), a thrust or turn share the row does not count
 * (the rows `forager:predator` and `reproducer:predator` read the flight in ticks and px of the hunter's creep, not a share of
 * the outputs) or a geometry tolerance.
 * @type {readonly {bar: string, value: number, why: string}[]}
 */
export const NO_ROW = Object.freeze([
    {
        bar: 'forager.fleeThrust',
        value: HAND_SET.forager.fleeThrust,
        why: 'the row forager:predator counts the flight in ticks and px, not a thrust share',
    },
    {
        bar: 'forager.fleeBehindThrust',
        value: HAND_SET.forager.fleeBehindThrust,
        why: 'the row forager:predator counts the flight in ticks and px, not a thrust share',
    },
    {
        bar: 'forager.turn (flee-threat)',
        value: HAND_SET.forager.turn,
        why: 'the row forager:predator has no turn step; the flight is a run',
    },
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
