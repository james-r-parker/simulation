// The body-sense and call reflex cases (brain-reflex-tests.md, T21a): the weaker of two prey, a threat that closes or
// leaves, a view crowded with threats, and a kin's hunt call. They read what a body shows another (size, speed and
// closing, docs/designs/body-genes.md) and the heard hunt call (docs/designs/status-effects.md). Bearings are in the
// subject's frame, positive towards positive `TURN`.

import { createConfig } from '../sim/config.js';
import { detCos, detSin } from '../sim/det-math.js';
import { SPEC, SPEC_NAMES } from '../sim/specs.js';
import { HUNTER_ENERGY, heading } from './memory-probe-scenarios.js';
import { defaultBars } from './reflex-bars.js';
import { RAY_SPACING, forwardRay, heardPlan, lone, preyAt } from './reflex-roles-stage.js';
import { DEG, bearingPoint, signedBearing, withMirrors } from './reflex-stage.js';

const CONFIG = createConfig();
/** The weaker prey is this share of the other's base size, and stands still; the other moves at this share of `maxVelocity`. */
const WEAK_SIZE_SHARE = 0.6;
const STRONG_SPEED_SHARE = 0.5;
/** The two prey of `pick-the-weak` stand this share of the view away; a threat of `flee-what-closes` this share. */
const PAIR_SHARE = 0.5;
const THREAT_SHARE = 0.55;
/** The threat of `flee-what-closes` moves at this share of `maxVelocity`, towards the subject or away from it. */
const THREAT_SPEED_SHARE = 0.5;
/** The lone prey of `mind-the-numbers` stands this share of the view away, on the heading to within this many degrees. */
const LONE_SHARE = 0.3;
const AHEAD_DEG = 3;
/** The crowd: prey at these multiples of the ray spacing off the heading, this far, and threats behind it. */
const CROWD_PREY_RAYS = Object.freeze([-3, -1, 1, 3]);
const CROWD_PREY_DISTANCE = 60;
const CROWD_THREAT_DEG = Object.freeze([135, 180, 225]);
const CROWD_THREAT_DISTANCE = 110;
/** A threat that a predator subject fears is bigger than it: this multiple of the base size. */
const BIG_SIZE_SHARE = 2;

/** @typedef {import('./reflex-stage.js').ReflexCase} ReflexCase */

/**
 * @param {number} angle a heading
 * @param {number} share the speed as a share of `maxVelocity`
 * @returns {{vx: number, vy: number}} the velocity along the heading
 */
const along = (angle, share) => ({
    vx: share * CONFIG.maxVelocity * detCos(angle),
    vy: share * CONFIG.maxVelocity * detSin(angle),
});

/** @type {ReflexCase} Of two prey in view, one smaller and slower, `TURN` is toward the weaker. */
const PICK_THE_WEAK = {
    name: 'pick-the-weak',
    scene: 'A real chase',
    spec: SPEC.PREDATOR,
    plan(rng, view) {
        const draw = { angle: heading(rng), bearing: forwardRay(rng) };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * d.bearing;
            const weak = {
                ...preyAt(d.angle, bearing, PAIR_SHARE * view),
                baseSize: WEAK_SIZE_SHARE * CONFIG.baseSize,
            };
            const strong = { ...preyAt(d.angle, -bearing, PAIR_SHARE * view), ...along(d.angle, STRONG_SPEED_SHARE) };
            return [{ kind: 'pair', bearing, mirror, ticks: [lone(d.angle, SPEC.PREDATOR, [weak, strong])] }];
        });
    },
    check: (outputs, { bearing }, bars = defaultBars()) => Math.sign(bearing) * outputs.turn >= bars.predator.turn,
};

/**
 * @param {number} spec the subject's specialisation
 * @returns {ReflexCase} `flee-what-closes` for it: a threat at one distance, closing and then leaving; the body goes away
 *   from it in the first row and not in the second (the forager's keeps the bare name)
 */
const fleeWhatCloses = (spec) => ({
    name: spec === SPEC.FORAGER ? 'flee-what-closes' : `flee-what-closes:${SPEC_NAMES[spec]}`,
    scene: 'A real chase',
    spec,
    plan(rng, view) {
        const draw = { angle: heading(rng), bearing: forwardRay(rng) };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * d.bearing;
            const facing = d.angle + bearing + Math.PI;
            const threat = (/** @type {number} */ sign) => ({
                ...bearingPoint(d.angle, bearing, THREAT_SHARE * view),
                angle: facing,
                spec: SPEC.PREDATOR,
                energy: HUNTER_ENERGY,
                ...along(facing, sign * THREAT_SPEED_SHARE),
            });
            return [
                { kind: 'closing', bearing, mirror, ticks: [lone(d.angle, spec, [threat(1)])] },
                { kind: 'leaving', bearing, mirror, ticks: [lone(d.angle, spec, [threat(-1)])] },
            ];
        });
    },
    check(outputs, { kind, bearing }, bars = defaultBars()) {
        if (kind === 'leaving') {
            return outputs.thrust < bars.role.thrust;
        }
        return (
            outputs.thrust >= bars.role.thrust &&
            Math.sign(bearing) * outputs.turn <= -bars.role.turnAway[SPEC_NAMES[spec]]
        );
    },
});

/**
 * @param {number} angle the subject's heading
 * @param {number} bearing a bearing in the subject's frame
 * @param {number} distance its distance
 * @returns {import('./pool-discrimination-stage.js').StagedAgent} a bigger predator, which could bite the subject
 */
const bigHunterAt = (angle, bearing, distance) => ({
    ...bearingPoint(angle, bearing, distance),
    angle,
    spec: SPEC.PREDATOR,
    energy: HUNTER_ENERGY,
    baseSize: BIG_SIZE_SHARE * CONFIG.baseSize,
});

/** @type {ReflexCase} One prey in view is sprinted at; prey filling half the view with threats on the other rays is not. */
const MIND_THE_NUMBERS = {
    name: 'mind-the-numbers',
    scene: 'Abort',
    spec: SPEC.PREDATOR,
    plan(rng, view) {
        const draw = { angle: heading(rng), offset: signedBearing(rng, 0, AHEAD_DEG) };
        return withMirrors(draw, (d, mirror) => {
            const prey = CROWD_PREY_RAYS.map((k) => preyAt(d.angle, mirror * k * RAY_SPACING, CROWD_PREY_DISTANCE));
            const threats = CROWD_THREAT_DEG.map((deg) =>
                bigHunterAt(d.angle, mirror * deg * DEG, CROWD_THREAT_DISTANCE),
            );
            const one = preyAt(d.angle, mirror * d.offset, LONE_SHARE * view);
            return [
                { kind: 'lone', bearing: 0, mirror, ticks: [lone(d.angle, SPEC.PREDATOR, [one])] },
                { kind: 'crowd', bearing: 0, mirror, ticks: [lone(d.angle, SPEC.PREDATOR, [...prey, ...threats])] },
            ];
        });
    },
    check: (outputs, { kind }, bars = defaultBars()) =>
        kind === 'lone' ? outputs.sprint >= bars.role.sprint.mid : outputs.sprint <= bars.role.sprint.far,
};

/** @type {ReflexCase} A hunter hears a kin's hunt call from a bearing, with no prey in view, and turns to it. */
const ANSWER_THE_CALL = {
    name: 'answer-the-call',
    scene: 'Pack, or loner',
    spec: SPEC.PREDATOR,
    plan: heardPlan(SPEC.PREDATOR, 'hunt'),
    check: (outputs, { bearing }, bars = defaultBars()) =>
        Math.sign(bearing) * outputs.turn >= bars.role.turn && outputs.thrust > bars.role.thrust,
};

export const BODY_CASES = Object.freeze([
    PICK_THE_WEAK,
    fleeWhatCloses(SPEC.FORAGER),
    fleeWhatCloses(SPEC.REPRODUCER),
    fleeWhatCloses(SPEC.SCOUT),
    MIND_THE_NUMBERS,
    ANSWER_THE_CALL,
]);
