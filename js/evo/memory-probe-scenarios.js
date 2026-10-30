// The three memory-probe scenarios (brain-capacity-and-memory.md, Memory probes): each stages one trial from the
// probe's seeded stream and says when it is over and whether it scored.

import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { CH_PREY } from './scripted-parts.js';
import { raySees, seesThreat, windowEnd } from './memory-probe-controls.js';

/** The arena's centre (the staged world is 3000 x 4000). */
export const CENTRE_X = 1500;
export const CENTRE_Y = 2000;
const TWO_PI = 6.283185307179586;

/** Ticks the target is in view before the blindfold: the doc's 20, and the blindfold lengths 60 and 600. */
export const SIGHT_TICKS = 20;
export const BLIND_TICKS = 60;
export const LONG_BLIND_TICKS = 600;
/** Ticks after the blindfold ends in which the food must be eaten, or the agent must still be alive. */
export const REACH_TICKS = 300;
/** Ticks after losing sight in which `scent-after-sight-loss` must bite the prey. */
export const SCENT_TICKS = 600;

/**
 * The food is staged this share of the subject's ray length away, so it is in view whatever the subject's
 * specialisation and vision gene (the doc's 400 px is beyond a forager's 300 px sight).
 */
export const FOOD_VIEW_SHARE = 0.9;
/** The hunter starts this far away, further than a forager can see; the prey is staged inside the subject's sight. */
const HUNTER_DISTANCE = 500;
export const PREY_VIEW_SHARE = 0.6;
export const PREDATOR_SPEC = 1;
export const FORAGER_SPEC = 0;
export const SUBJECT_ENERGY = 800;
export const HUNTER_ENERGY = 1500;
const LONG_TRIAL_TICKS = 1200;

/**
 * @typedef {object} Scenario
 * @property {string} name the scenario's name (`food-then-blind@600` for the long blindfold)
 * @property {string} metric the score's metric name
 * @property {number} spec the specialisation a reference controller is staged with
 * @property {boolean} needsHunter whether the subject must have a `canHunt` specialisation
 * @property {boolean} windowed whether the scenario has a blindfold window (without one the controls are intact and
 *   amnesia only)
 * @property {(rng: import('../sim/rng.js').Rng, view: number) => import('./memory-probe-run.js').Plan} plan the
 *   staging of one trial, drawn from the probe's stream; `view` is the subject's ray length
 */

/**
 * @param {import('../sim/rng.js').Rng} rng the probe's stream
 * @returns {number} a heading in (-PI, PI)
 */
export function heading(rng) {
    return nextFloat(rng) * TWO_PI - TWO_PI / 2;
}

/**
 * @param {number} angle a bearing
 * @param {number} distance from the arena's centre
 * @returns {{x: number, y: number}} the point
 */
export function around(angle, distance) {
    return { x: CENTRE_X + distance * detCos(angle), y: CENTRE_Y + distance * detSin(angle) };
}

/**
 * @param {number} blind the blindfold length in ticks
 * @returns {Scenario} `food-then-blind`: one food item in view, then a blindfold, the food stays
 */
function foodThenBlind(blind) {
    const long = blind !== BLIND_TICKS;
    return {
        name: long ? `food-then-blind@${blind}` : 'food-then-blind',
        metric: long ? `probe.food_reach@${blind}` : 'probe.food_reach',
        spec: FORAGER_SPEC,
        needsHunter: false,
        windowed: true,
        plan(rng, view) {
            const food = around(heading(rng), FOOD_VIEW_SHARE * view);
            return {
                stage: {
                    foods: [food],
                    rocks: [],
                    agents: [
                        {
                            role: 'subject',
                            x: CENTRE_X,
                            y: CENTRE_Y,
                            angle: heading(rng),
                            spec: FORAGER_SPEC,
                            energy: SUBJECT_ENERGY,
                        },
                    ],
                },
                timing: { trigger: () => true, delay: SIGHT_TICKS, length: blind },
                scent: false,
                maxTicks: SIGHT_TICKS + blind + REACH_TICKS,
                done: (world) => world.foodCount === 0,
                won: (world) => world.foodCount === 0,
            };
        },
    };
}

/** @type {Scenario} `predator-out-of-view`: a scripted hunter closes in; the senses go dark mid-flight, the hunter keeps hunting */
const PREDATOR_OUT_OF_VIEW = {
    name: 'predator-out-of-view',
    metric: 'probe.flee_survival',
    spec: FORAGER_SPEC,
    needsHunter: false,
    windowed: true,
    plan(rng) {
        const theta = heading(rng);
        const hunter = around(theta, HUNTER_DISTANCE);
        return {
            stage: {
                foods: [],
                rocks: [],
                agents: [
                    {
                        role: 'subject',
                        x: CENTRE_X,
                        y: CENTRE_Y,
                        angle: heading(rng),
                        spec: FORAGER_SPEC,
                        energy: SUBJECT_ENERGY,
                    },
                    {
                        role: 'hunter',
                        ...hunter,
                        angle: theta + TWO_PI / 2,
                        spec: PREDATOR_SPEC,
                        energy: HUNTER_ENERGY,
                    },
                ],
            },
            timing: { trigger: seesThreat, delay: SIGHT_TICKS, length: BLIND_TICKS },
            scent: true,
            maxTicks: LONG_TRIAL_TICKS,
            done: (world, control) => {
                const end = windowEnd(control);
                return world.alive[0] === 0 || (end !== null && world.tick >= end + REACH_TICKS);
            },
            won: (world) => world.alive[0] === 1,
        };
    },
};

/**
 * @returns {{sawPrey: boolean, lostAt: number | null}} a fresh sight-loss tracker
 */
function sightTracker() {
    return { sawPrey: false, lostAt: null };
}

/** @type {Scenario} `scent-after-sight-loss`: a fleeing prey runs out of the hunter's view; scent is all that is left */
const SCENT_AFTER_SIGHT_LOSS = {
    name: 'scent-after-sight-loss',
    metric: 'probe.scent_follow',
    spec: PREDATOR_SPEC,
    needsHunter: true,
    windowed: false,
    plan(rng, view) {
        const theta = heading(rng);
        const side = nextFloat(rng) < 0.5 ? -1 : 1;
        const sight = sightTracker();
        let bitten = false;
        return {
            stage: {
                foods: [],
                rocks: [],
                agents: [
                    {
                        role: 'subject',
                        x: CENTRE_X,
                        y: CENTRE_Y,
                        angle: theta,
                        spec: PREDATOR_SPEC,
                        energy: HUNTER_ENERGY,
                    },
                    {
                        role: 'prey',
                        ...around(theta + (side * TWO_PI) / 6, PREY_VIEW_SHARE * view),
                        angle: theta + side * (TWO_PI / 4),
                        spec: FORAGER_SPEC,
                        energy: SUBJECT_ENERGY,
                    },
                ],
            },
            timing: null,
            scent: false,
            maxTicks: LONG_TRIAL_TICKS,
            done: (world) => {
                const sees = raySees(world, 0, CH_PREY);
                sight.sawPrey ||= sees;
                sight.lostAt ??= sight.sawPrey && !sees ? world.tick : null;
                bitten ||= world.lastBiter[1] === world.genomeId[0];
                return (
                    bitten ||
                    world.alive[0] === 0 ||
                    (sight.lostAt !== null && world.tick - sight.lostAt >= SCENT_TICKS)
                );
            },
            won: () => bitten,
        };
    },
};

/** The memory scenarios, in the order the doc lists them, then the long blindfold. */
export const SCENARIOS = Object.freeze([
    foodThenBlind(BLIND_TICKS),
    PREDATOR_OUT_OF_VIEW,
    SCENT_AFTER_SIGHT_LOSS,
    foodThenBlind(LONG_BLIND_TICKS),
]);
