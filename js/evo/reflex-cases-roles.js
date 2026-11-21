// The role reflex cases (brain-reflex-tests.md, Phase 5): the first skill each role's job needs, read from the inputs
// the sim gives it - a sprint at prey, a bite held for the jaws, an alarm on a threat, a turn to a heard call, a flight
// from one, and a step round a herd. Bearings are in the subject's frame, positive towards positive `TURN`.

import { createConfig } from '../sim/config.js';
import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { SPEC, SPEC_NAMES } from '../sim/specs.js';
import { HUNTER_ENERGY, SUBJECT_ENERGY, heading } from './memory-probe-scenarios.js';
import { victimStaging } from './reflex-cases-predator.js';
import { defaultBars } from './reflex-bars.js';
import { DEG, SEQUENCE_TICKS, bearingPoint, signedBearing, subjectAgent, withMirrors } from './reflex-stage.js';

/** Where the prey stands in `sprint-on-prey`, as shares of the view. */
const SPRINT_SHARES = Object.freeze({ far: 0.8, mid: 0.55, near: 0.3 });
/** The prey that is in view but not in the jaws stands this share of the view away. */
const IN_VIEW_SHARE = 0.5;
/** The widest the prey sits off the heading in the two predator cases, in degrees. */
const AHEAD_DEG = 3;
/** The threat stands this share of the view away: the edge of what the scout sees. */
const EDGE_SHARE = 0.9;
/** The ray spacing, and the farthest forward ray a threat or a herd stands on (ray 3 is 67.5 degrees off). */
const RAY_SPACING = (2 * Math.PI) / createConfig().rayCount;
const RAY_JITTER_DEG = 3;
const FORWARD_RAYS = 3;
/** A heard call is loud, and comes from this far off the heading. */
const HEARD_LOUDNESS = 1;
const HEARD_FROM_DEG = 20;
const HEARD_TO_DEG = 140;
/** The herd animal closes from the first share of the view to the second over the sequence. */
const HERD_FROM = 0.7;
const HERD_TO = 0.4;

/** @typedef {import('./reflex-stage.js').ReflexCase} ReflexCase */

/**
 * @param {import('../sim/rng.js').Rng} rng the case's stream
 * @returns {number} a signed bearing on one of the forward rays (a whole number of ray spacings, 1 to `FORWARD_RAYS`)
 *   plus up to `RAY_JITTER_DEG` either way, so the item stands on that ray alone
 */
function forwardRay(rng) {
    const k = 1 + Math.floor(FORWARD_RAYS * nextFloat(rng));
    const bearing = k * RAY_SPACING + (2 * nextFloat(rng) - 1) * RAY_JITTER_DEG * DEG;
    return nextFloat(rng) < 0.5 ? -bearing : bearing;
}

/**
 * @param {number} angle the subject's heading
 * @param {number} spec the subject's specialisation
 * @param {import('./pool-discrimination-stage.js').StagedAgent[]} [others] the other agents
 * @returns {{foods: never[], rocks: never[], agents: import('./pool-discrimination-stage.js').StagedAgent[]}} a tick
 */
const lone = (angle, spec, others = []) => ({
    foods: [],
    rocks: [],
    agents: [subjectAgent(spec, angle), ...others],
});

/**
 * @param {number} angle the subject's heading
 * @param {number} bearing where the forager stands, in the subject's frame
 * @param {number} distance its distance
 * @returns {import('./pool-discrimination-stage.js').StagedAgent} a forager a predator can bite, facing along the heading
 */
const preyAt = (angle, bearing, distance) => ({
    ...bearingPoint(angle, bearing, distance),
    angle,
    spec: SPEC.FORAGER,
    energy: SUBJECT_ENERGY,
});

/**
 * A plan that draws a heading and a small offset off it, and stages each orientation with `build`.
 * @param {(d: {angle: number, offset: number}, mirror: 1 | -1, view: number) => import('./reflex-stage.js').Staging[]} build
 *   the stagings of one orientation
 * @returns {ReflexCase['plan']} the plan
 */
const aheadPlan = (build) => (rng, view) => {
    const draw = { angle: heading(rng), offset: signedBearing(rng, 0, AHEAD_DEG) };
    return withMirrors(draw, (d, mirror) => build(d, mirror, view));
};

/** @type {ReflexCase} A prey is sprinted at harder the nearer it is, and not at all when none is in view. */
const SPRINT_ON_PREY = {
    name: 'sprint-on-prey',
    scene: 'A real chase',
    spec: SPEC.PREDATOR,
    plan: aheadPlan((d, mirror, view) => {
        const bearing = mirror * d.offset;
        const seen = Object.entries(SPRINT_SHARES).map(([kind, share]) => ({
            kind,
            bearing,
            mirror,
            ticks: [lone(d.angle, SPEC.PREDATOR, [preyAt(d.angle, bearing, share * view)])],
        }));
        return [...seen, { kind: 'none', bearing: 0, mirror, ticks: [lone(d.angle, SPEC.PREDATOR)] }];
    }),
    check(outputs, { kind }, bars = defaultBars()) {
        return kind === 'none' ? outputs.sprint <= 0 : outputs.sprint >= bars.role.sprint[/** @type {'far'} */ (kind)];
    },
};

/** @type {ReflexCase} `BITE` is held for a prey in the jaws: not for one in view, and not for nothing (the blind bite). */
const HOLD_THE_BITE = {
    name: 'hold-the-bite',
    scene: 'A real chase',
    spec: SPEC.PREDATOR,
    plan: aheadPlan((d, mirror, view) => {
        const bearing = mirror * d.offset;
        const far = preyAt(d.angle, bearing, IN_VIEW_SHARE * view);
        return [
            victimStaging(d, mirror, { kind: 'jaws', energy: SUBJECT_ENERGY }),
            { kind: 'in-view', bearing, mirror, ticks: [lone(d.angle, SPEC.PREDATOR, [far])] },
            { kind: 'empty', bearing: 0, mirror, ticks: [lone(d.angle, SPEC.PREDATOR)] },
        ];
    }),
    check(outputs, { kind }, bars = defaultBars()) {
        return kind === 'jaws' ? outputs.bite > bars.role.bite : outputs.bite <= bars.role.bite;
    },
};

/** @type {ReflexCase} A scout calls on a threat at the edge of its view, and is quiet when the ray is empty. */
const CALL_ON_THREAT = {
    name: 'call-on-threat',
    scene: 'A real chase',
    spec: SPEC.SCOUT,
    plan(rng, view) {
        const draw = { angle: heading(rng), bearing: forwardRay(rng) };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * d.bearing;
            const hunter = {
                ...bearingPoint(d.angle, bearing, EDGE_SHARE * view),
                angle: d.angle + bearing + Math.PI,
                spec: SPEC.PREDATOR,
                energy: HUNTER_ENERGY,
            };
            return [
                { kind: 'threat', bearing, mirror, ticks: [lone(d.angle, SPEC.SCOUT, [hunter])] },
                { kind: 'empty', bearing, mirror, ticks: [lone(d.angle, SPEC.SCOUT)] },
            ];
        });
    },
    check(outputs, { kind }, bars = defaultBars()) {
        const { alarm } = bars.role;
        return kind === 'threat' ? outputs.alarm > alarm : outputs.alarm <= alarm;
    },
};

/**
 * A loud alarm heard from a bearing, with nothing in view.
 * @param {number} spec the subject's specialisation
 * @returns {ReflexCase['plan']} the plan
 */
const heardPlan = (spec) => (rng) => {
    const draw = { angle: heading(rng), bearing: signedBearing(rng, HEARD_FROM_DEG, HEARD_TO_DEG) };
    return withMirrors(draw, (d, mirror) => {
        const bearing = mirror * d.bearing;
        const heard = { loudness: HEARD_LOUDNESS, ux: detCos(d.angle + bearing), uy: detSin(d.angle + bearing) };
        return [{ kind: 'alarm', bearing, mirror, ticks: [{ ...lone(d.angle, spec), heard }] }];
    });
};

/** @type {ReflexCase} A defender turns to a call and goes. */
const TURN_TO_ALARM = {
    name: 'turn-to-alarm',
    scene: 'Family tolerance',
    spec: SPEC.DEFENDER,
    plan: heardPlan(SPEC.DEFENDER),
    check: (outputs, { bearing }, bars = defaultBars()) =>
        Math.sign(bearing) * outputs.turn >= bars.role.turn && outputs.thrust > bars.role.thrust,
};

/**
 * @param {number} spec the subject's specialisation
 * @returns {ReflexCase['check']} a check that the body turns off the line to a heard call or a herd and keeps moving
 */
const awayCheck =
    (spec) =>
    (outputs, { bearing }, bars = defaultBars()) =>
        Math.sign(bearing) * outputs.turn <= -bars.role.turnAway[SPEC_NAMES[spec]] &&
        outputs.thrust >= bars.role.thrust;

/** @type {ReflexCase} A forager hears the call, and goes the other way. */
const FLEE_ON_ALARM = {
    name: 'flee-on-alarm',
    scene: 'A real chase',
    spec: SPEC.FORAGER,
    plan: heardPlan(SPEC.FORAGER),
    check: awayCheck(SPEC.FORAGER),
};

/**
 * A herd animal closes on the forward rays.
 * @param {number} spec the subject's specialisation
 * @returns {ReflexCase['plan']} the plan
 */
const herdPlan = (spec) => (rng, view) => {
    const draw = { angle: heading(rng), bearing: forwardRay(rng) };
    return withMirrors(draw, (d, mirror) => {
        const bearing = mirror * d.bearing;
        const ticks = Array.from({ length: SEQUENCE_TICKS }, (_, t) => {
            const share = HERD_FROM + ((HERD_TO - HERD_FROM) * t) / (SEQUENCE_TICKS - 1);
            return { ...lone(d.angle, spec), herd: bearingPoint(d.angle, bearing, share * view) };
        });
        return [{ kind: 'herd', bearing, mirror, ticks }];
    });
};

/**
 * @param {number} spec the subject's specialisation
 * @returns {ReflexCase} `clear-the-herd` for it: the body turns off the herd's line and keeps moving (the forager's keeps
 *   the bare name)
 */
const clearTheHerd = (spec) => ({
    name: spec === SPEC.FORAGER ? 'clear-the-herd' : `clear-the-herd:${SPEC_NAMES[spec]}`,
    scene: 'A real chase',
    spec,
    plan: herdPlan(spec),
    check: (outputs, { bearing }, bars = defaultBars()) =>
        Math.sign(bearing) * outputs.turn <= -bars.role.herdTurn && outputs.thrust >= bars.role.herdThrust,
});

/** @type {ReflexCase} A reproducer hears the call, and goes the other way. */
const FLEE_ON_ALARM_REPRODUCER = {
    ...FLEE_ON_ALARM,
    name: 'flee-on-alarm:reproducer',
    spec: SPEC.REPRODUCER,
    plan: heardPlan(SPEC.REPRODUCER),
    check: awayCheck(SPEC.REPRODUCER),
};

export const ROLE_CASES = Object.freeze([
    SPRINT_ON_PREY,
    HOLD_THE_BITE,
    CALL_ON_THREAT,
    TURN_TO_ALARM,
    FLEE_ON_ALARM,
    FLEE_ON_ALARM_REPRODUCER,
    ...SPEC_NAMES.map((_, spec) => clearTheHerd(spec)),
]);
