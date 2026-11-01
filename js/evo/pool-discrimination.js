// The discrimination checks for pooled-v4: position, threats, a corridor, food-hue choice and distinct megafauna hits.
// each scored for a controller that reads the pooled row and one that reads the raw rays. A scene passes when the
// pooled controller scores within 10% of the raw one. These diagnostic controllers do not change the evolved brain or its instinct.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { createRng, fork, nextFloat } from '../sim/rng.js';
import { step } from '../sim/step.js';
import { poolRays } from '../sim/ray-pool.js';
import { followCorridor, flee, seekFood, seekFoodHue } from './pool-discrimination-controllers.js';
import { stageWorld } from './pool-discrimination-stage.js';
import { COMBAT_CONTROLLERS } from './scripted-combat.js';

/** The pooled score must reach this share of the raw score for a scene to pass. */
export const PASS_SHARE = 0.9;

const TWO_PI = 6.283185307179586;
const CENTRE_X = 1500;
const CENTRE_Y = 2000;
const FORAGER = 0;
const PREDATOR = 1;
const HUNTER_ENERGY = 1500;
const SUBJECT_ENERGY = 800;
const PASSAGE_ROCK = 50;
const PASSAGE_HALF_WIDTH = 80;
const PASSAGE_ROCKS_PER_ROW = 17;

/**
 * @typedef {object} Scene
 * @property {string} name the scene's name
 * @property {number} ticks ticks per trial
 * @property {(rng: import('../sim/rng.js').Rng) => Omit<import('./pool-discrimination-stage.js').Stage, 'seed'>} build
 *   the staging of one trial, drawn from the scene's stream
 * @property {(world: Record<string, any>, slot: number, pooled: boolean) => void} act the subject's controller
 * @property {(world: Record<string, any>) => boolean} won whether the trial scored
 * @property {boolean} [hunters] whether the other agents run the scripted `hunter`
 * @property {boolean} [holds] whether the score is the state at the last tick (surviving); otherwise a trial scores as
 *   soon as `won` is true
 */

/**
 * @param {import('../sim/rng.js').Rng} rng the scene's stream
 * @returns {number} a heading in (-PI, PI)
 */
function heading(rng) {
    return nextFloat(rng) * TWO_PI - TWO_PI / 2;
}

/** @type {Scene} */
const TWO_FOOD_OPPOSITE = {
    name: 'two-food-opposite',
    ticks: 700,
    build(rng) {
        const theta = heading(rng);
        const dx = 100 * detCos(theta);
        const dy = 100 * detSin(theta);
        return {
            foods: [
                { x: CENTRE_X + dx, y: CENTRE_Y + dy },
                { x: CENTRE_X - dx, y: CENTRE_Y - dy },
            ],
            rocks: [],
            agents: [{ x: CENTRE_X, y: CENTRE_Y, angle: heading(rng), spec: FORAGER, energy: SUBJECT_ENERGY }],
        };
    },
    act: seekFood,
    won: (world) => world.foodCount === 0,
};

/** @type {Scene} */
const TWO_THREATS_APART = {
    name: 'two-threats-apart',
    ticks: 120,
    hunters: true,
    build(rng) {
        const first = heading(rng);
        const hunter = (/** @type {number} */ angle) => ({
            x: CENTRE_X + 250 * detCos(angle),
            y: CENTRE_Y + 250 * detSin(angle),
            angle: angle + TWO_PI / 2,
            spec: PREDATOR,
            energy: HUNTER_ENERGY,
        });
        return {
            foods: [],
            rocks: [],
            agents: [
                { x: CENTRE_X, y: CENTRE_Y, angle: heading(rng), spec: FORAGER, energy: SUBJECT_ENERGY },
                hunter(first),
                hunter(first + TWO_PI / 3),
            ],
        };
    },
    holds: true,
    act: flee,
    won: (world) => world.alive[0] === 1,
};

/** @type {Scene} */
const CORRIDOR = {
    name: 'corridor',
    ticks: 500,
    build(rng) {
        const rocks = [];
        for (let i = 0; i < PASSAGE_ROCKS_PER_ROW; i++) {
            const x = 800 + 2 * PASSAGE_ROCK * i;
            rocks.push({ x, y: CENTRE_Y - PASSAGE_HALF_WIDTH - PASSAGE_ROCK, r: PASSAGE_ROCK });
            rocks.push({ x, y: CENTRE_Y + PASSAGE_HALF_WIDTH + PASSAGE_ROCK, r: PASSAGE_ROCK });
        }
        return {
            foods: [
                { x: 2300, y: CENTRE_Y },
                { x: 500, y: CENTRE_Y },
            ],
            rocks,
            agents: [
                {
                    x: 900,
                    y: CENTRE_Y + (nextFloat(rng) - 0.5) * 60,
                    angle: (nextFloat(rng) - 0.5) * 0.6,
                    spec: FORAGER,
                    energy: SUBJECT_ENERGY,
                },
            ],
        };
    },
    act: followCorridor,
    won: (world) => world.foodAlive[0] === 0,
};

/** @type {Scene} */
const FOOD_HUE_CHOICE = {
    name: 'food-hue-choice',
    ticks: 1,
    holds: true,
    build(rng) {
        const theta = heading(rng);
        const direction = nextFloat(rng) < 0.5 ? -1 : 1;
        const dx = direction * 100 * detCos(theta);
        const dy = direction * 100 * detSin(theta);
        return {
            foods: [
                { x: CENTRE_X + dx, y: CENTRE_Y + dy, hue: -0.75 },
                { x: CENTRE_X - dx, y: CENTRE_Y - dy, hue: 0.75 },
            ],
            rocks: [],
            agents: [{ x: CENTRE_X, y: CENTRE_Y, angle: theta, spec: FORAGER, energy: SUBJECT_ENERGY }],
        };
    },
    act: seekFoodHue,
    won(world) {
        const dx = world.foodX[0] - world.x[0];
        const dy = world.foodY[0] - world.y[0];
        const ahead = dx * detCos(world.angle[0]) + dy * detSin(world.angle[0]) > 0;
        const turning = Math.abs(world.outputs[OUTPUT_INDEX.TURN]) > 0.5;
        return world.outputs[OUTPUT_INDEX.THRUST] > 0 && turning !== ahead;
    },
};

/** The three brain-plan scenes followed by the first-decision hue discrimination. */
export const SCENES = Object.freeze([TWO_FOOD_OPPOSITE, TWO_THREATS_APART, CORRIDOR, FOOD_HUE_CHOICE]);

/**
 * Runs one trial.
 * @param {Scene} scene the scene
 * @param {{pooled: boolean, seed: number, rng: import('../sim/rng.js').Rng}} run which controller, the world seed and
 *   the staging stream (the same for both controllers, so they see the same trial)
 * @returns {boolean} whether the trial scored
 */
function runTrial(scene, { pooled, seed, rng }) {
    const { world, policy } = stageWorld({ ...scene.build(rng), seed });
    const hunt = scene.hunters ? COMBAT_CONTROLLERS.hunter({ world, rng: fork(createRng(seed), 'scripted') }) : null;
    const brain = (/** @type {Record<string, any>} */ w) => {
        for (let slot = 0; slot < w.alive.length; slot++) {
            if (w.alive[slot] === 1) {
                poolRays(w, slot);
            }
        }
        hunt?.(w);
        if (w.alive[0] === 1) {
            scene.act(w, 0, pooled);
        }
    };
    for (let t = 0; t < scene.ticks && (scene.holds || !scene.won(world)); t++) {
        step(world, policy, { brain });
    }
    return scene.won(world);
}

/**
 * @typedef {object} SceneResult
 * @property {string} scene the scene's name
 * @property {number} trials trials per controller
 * @property {number} pooled the pooled controller's score, 0 to 1
 * @property {number} raw the raw-ray controller's score, 0 to 1
 * @property {boolean} pass whether the raw controller scored and the pooled one is within 10% of it
 */

/**
 * Scores both controllers on the same trials of one scene.
 * @param {Scene} scene the scene
 * @param {{trials: number, seed: number}} options trials per controller and the base seed
 * @returns {SceneResult} the result
 */
export function runScene(scene, { trials, seed }) {
    const wins = { pooled: 0, raw: 0 };
    for (let trial = 0; trial < trials; trial++) {
        for (const pooled of [true, false]) {
            const rng = fork(createRng(seed + trial), scene.name);
            if (runTrial(scene, { pooled, seed: seed + trial, rng })) {
                wins[pooled ? 'pooled' : 'raw'] += 1;
            }
        }
    }
    const pooled = wins.pooled / trials;
    const raw = wins.raw / trials;
    return { scene: scene.name, trials, pooled, raw, pass: raw > 0 && pooled >= PASS_SHARE * raw };
}

/**
 * Runs the discrimination scenes.
 * @param {{trials?: number, seed?: number}} [options] trials per controller (default 16) and the base seed (default 1)
 * @returns {{scenes: SceneResult[], pass: boolean}} each scene's result, and whether all three pass; any failure makes
 *   the top-2-per-channel variant the fallback to consider
 */
export function runPoolDiscrimination({ trials = 16, seed = 1 } = {}) {
    const scenes = SCENES.map((scene) => runScene(scene, { trials, seed }));
    return { scenes, pass: scenes.every((s) => s.pass) };
}
