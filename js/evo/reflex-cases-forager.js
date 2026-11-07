// The four forager reflex cases (brain-reflex-tests.md, Cases): flee a closing hunter, approach food, pick the safe food
// of two, and keep clear of a wall or a rock. Each plans the stagings of one trial (both orientations); each `check`
// reads one tick's outputs. Bearings are in the subject's frame, positive towards positive `TURN`.

import { createConfig } from '../sim/config.js';
import { FLORA_DEFAULTS } from '../sim/config-flora.js';
import { nextFloat } from '../sim/rng.js';
import { CENTRE_Y, FORAGER_SPEC, HUNTER_ENERGY, PREDATOR_SPEC, heading } from './memory-probe-scenarios.js';
import { DEG, SEQUENCE_TICKS, bearingPoint, signedBearing, subjectAgent, withMirrors } from './reflex-stage.js';

/** The thresholds, as shares of the output range (starting values of the doc, calibrated by T4). */
export const FORAGER_BARS = Object.freeze({
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
});
const BAR = FORAGER_BARS;

/** Where the things sit, as shares of the subject's view. */
const HUNTER_FROM = 0.5;
const HUNTER_TO = 0.3;
const OBSTACLE_SHARE = 0.3;
const ROCK_RADIUS = 60;
const FOOD_AHEAD_SHARE = 0.7;
const TOXIC_SHARE = 0.55;
const SAFE_SHARE = 0.8;
/** The spacing of the rays, and how far off a ray direction an item may stand and still be hit by that ray alone. */
const RAY_SPACING = (2 * Math.PI) / createConfig().rayCount;
const RAY_JITTER_DEG = 4;
const TOXIC = FLORA_DEFAULTS.toxiccap;
const SAFE = FLORA_DEFAULTS.grass;
/** The share of `approach-food` trials that put the food inside the ray-0 cone. */
const AHEAD_SHARE = 0.15;
const AHEAD_DEG = 5;
/** The widest bearing of a `wide` food: dead behind sits on the ray whose turn side is a tie, so the brain has no side to pick. */
const WIDE_MAX_DEG = 160;

/**
 * @param {number} angle the subject's heading
 * @returns {import('./pool-discrimination-stage.js').StagedAgent} a forager subject
 */
const forager = (angle) => subjectAgent(FORAGER_SPEC, angle);

/** @typedef {import('./reflex-stage.js').Staging} Staging */
/** @typedef {import('./reflex-stage.js').ReflexOutputs} ReflexOutputs */

/**
 * @param {ReflexOutputs} outputs a tick's outputs
 * @param {number} bearing the bearing of the item
 * @returns {number} the turn in the direction of the item: positive turns towards it, negative away
 */
function turnToward(outputs, bearing) {
    return Math.sign(bearing) * outputs.turn;
}

/** @type {import('./reflex-stage.js').ReflexCase} A hunter closes from `HUNTER_FROM` to `HUNTER_TO` of view. */
const FLEE_THREAT = {
    name: 'flee-threat',
    scene: 'A real chase',
    spec: FORAGER_SPEC,
    plan(rng, view) {
        const draw = { angle: heading(rng), bearing: signedBearing(rng, 20, 180) };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * d.bearing;
            const ticks = Array.from({ length: SEQUENCE_TICKS }, (_, t) => {
                const share = HUNTER_FROM + ((HUNTER_TO - HUNTER_FROM) * t) / (SEQUENCE_TICKS - 1);
                const at = bearingPoint(d.angle, bearing, share * view);
                const hunter = {
                    ...at,
                    angle: d.angle + bearing + Math.PI,
                    spec: PREDATOR_SPEC,
                    energy: HUNTER_ENERGY,
                };
                return { foods: [], rocks: [], agents: [forager(d.angle), hunter] };
            });
            return [{ kind: 'threat', bearing, mirror, ticks }];
        });
    },
    check(outputs, { bearing }) {
        if (Math.abs(bearing) > BAR.behindDeg * DEG) {
            return outputs.thrust >= BAR.fleeBehindThrust;
        }
        return outputs.thrust >= BAR.fleeThrust && turnToward(outputs, bearing) <= -BAR.turn;
    },
};

/** @type {import('./reflex-stage.js').ReflexCase} One food in view, wide of the heading or inside the ray-0 cone. */
const APPROACH_FOOD = {
    name: 'approach-food',
    scene: 'Leave a dying patch',
    spec: FORAGER_SPEC,
    plan(rng, view) {
        const draw = {
            angle: heading(rng),
            wide: signedBearing(rng, 15, WIDE_MAX_DEG),
            near: signedBearing(rng, 0, AHEAD_DEG),
            share: 0.4 + 0.4 * nextFloat(rng),
            ahead: nextFloat(rng) < AHEAD_SHARE,
        };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * (d.ahead ? d.near : d.wide);
            const food = bearingPoint(d.angle, bearing, d.share * view);
            const stage = { foods: [food], rocks: [], agents: [forager(d.angle)] };
            return [{ kind: d.ahead ? 'ahead' : 'wide', bearing, mirror, ticks: [stage] }];
        });
    },
    check(outputs, staging) {
        if (staging.kind === 'ahead') {
            return outputs.thrust >= BAR.aheadThrust && Math.abs(outputs.turn) <= BAR.aheadTurn;
        }
        return turnToward(outputs, staging.bearing) >= BAR.turn && outputs.thrust > BAR.approachThrust;
    },
};

/**
 * @param {import('../sim/rng.js').Rng} rng the case's stream
 * @param {number} rays how many ray directions to choose from, starting at 1
 * @returns {number} a ray direction (a whole number of ray spacings) plus up to `RAY_JITTER_DEG` either way
 */
function nearRay(rng, rays) {
    const k = 1 + Math.floor(rays * nextFloat(rng));
    return k * RAY_SPACING + (2 * nextFloat(rng) - 1) * RAY_JITTER_DEG * DEG;
}

/**
 * A toxic item nearer, a safe one farther on the other side. Pooling keeps the two strongest food hits, so each item
 * must take one ray or the nearer would fill both slots and hide the safe one: each stands on a ray direction (within
 * `RAY_JITTER_DEG`) at a distance where its neighbours' rays miss it.
 * @type {import('./reflex-stage.js').ReflexCase}
 */
const PICK_SAFE_FOOD = {
    name: 'pick-safe-food',
    scene: 'Season changes the map',
    spec: FORAGER_SPEC,
    plan(rng, view) {
        const side = nextFloat(rng) < 0.5 ? -1 : 1;
        const draw = { angle: heading(rng), side, toxic: nearRay(rng, 2), safe: nearRay(rng, 3) };
        return withMirrors(draw, (d, mirror) => {
            const toxic = mirror * d.side * d.toxic;
            const safe = -mirror * d.side * d.safe;
            const foods = [
                { ...bearingPoint(d.angle, toxic, TOXIC_SHARE * view), hue: TOXIC.hue, toxicity: TOXIC.toxicity },
                { ...bearingPoint(d.angle, safe, SAFE_SHARE * view), hue: SAFE.hue, toxicity: SAFE.toxicity },
            ];
            return [{ kind: 'safe', bearing: safe, mirror, ticks: [{ foods, rocks: [], agents: [forager(d.angle)] }] }];
        });
    },
    check(outputs, { bearing }) {
        return turnToward(outputs, bearing) >= BAR.turn && outputs.thrust > BAR.approachThrust;
    },
};

/**
 * @param {number} angle the subject's heading
 * @param {{x: number, y: number}} rock where the rock is
 * @param {{x: number, y: number}[]} [foods] the food in view
 * @returns {Omit<import('./pool-discrimination-stage.js').Stage, 'seed'>} a rock, maybe food, and the subject
 */
function rockStage(angle, rock, foods = []) {
    return { foods, rocks: [{ ...rock, r: ROCK_RADIUS }], agents: [forager(angle)] };
}

/**
 * The three stagings of `avoid-obstacle` for one orientation.
 * @param {{angle: number, incidence: number, ahead: number, beside: number, view: number}} d the draw
 * @param {1 | -1} mirror the orientation
 * @returns {Staging[]} the wall, the rock ahead and the rock beside with food ahead
 */
function obstacleStagings(d, mirror) {
    const wallAngle = Math.PI + mirror * d.incidence;
    const wallSubject = { ...forager(wallAngle), x: OBSTACLE_SHARE * d.view, y: CENTRE_Y };
    const wall = { foods: [], rocks: [], agents: [wallSubject] };
    const ahead = mirror * d.ahead;
    const beside = mirror * d.beside;
    const near = OBSTACLE_SHARE * d.view;
    const food = bearingPoint(d.angle, 0, FOOD_AHEAD_SHARE * d.view);
    return [
        { kind: 'wall', bearing: -mirror * d.incidence, mirror, ticks: [wall] },
        { kind: 'rock-ahead', bearing: ahead, mirror, ticks: [rockStage(d.angle, bearingPoint(d.angle, ahead, near))] },
        {
            kind: 'rock-beside',
            bearing: beside,
            mirror,
            ticks: [rockStage(d.angle, bearingPoint(d.angle, beside, near), [food])],
        },
    ];
}

/** @type {import('./reflex-stage.js').ReflexCase} A wall or a rock ahead is turned from; a rock beside is passed. */
const AVOID_OBSTACLE = {
    name: 'avoid-obstacle',
    scene: 'A real chase; Refuge',
    spec: FORAGER_SPEC,
    plan(rng, view) {
        const draw = {
            angle: heading(rng),
            incidence: signedBearing(rng, 0, 40),
            ahead: signedBearing(rng, 0, 25),
            beside: signedBearing(rng, 60, 90),
            view,
        };
        return withMirrors(draw, obstacleStagings);
    },
    check(outputs, { kind, bearing }) {
        if (kind === 'rock-beside') {
            return outputs.thrust >= BAR.passThrust && Math.abs(outputs.turn) <= BAR.passTurn;
        }
        const clear = Math.abs(bearing) < BAR.deadAheadDeg * DEG || turnToward(outputs, bearing) < 0;
        return outputs.thrust <= BAR.stopThrust || (Math.abs(outputs.turn) >= BAR.avoidTurn && clear);
    },
};

export const FORAGER_CASES = Object.freeze([FLEE_THREAT, APPROACH_FOOD, PICK_SAFE_FOOD, AVOID_OBSTACLE]);
