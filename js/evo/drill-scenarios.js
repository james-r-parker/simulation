// The drills (training.md, Drills): fixed scenarios that test one skill of a genome, in the shape of the memory-probe
// scenarios. A drill's score is a detector; it never enters fitness, merit, mate rank or archive rank.

import { createConfig } from '../sim/config.js';
import { FLORA_DEFAULTS } from '../sim/config-flora.js';
import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { REFUGE_ROCKS, REFUGE_ROCK_RADIUS, ringRadius } from '../sim/terrain.js';
import {
    CENTRE_X,
    CENTRE_Y,
    FOOD_VIEW_SHARE,
    FORAGER_SPEC,
    HUNTER_ENERGY,
    PREDATOR_SPEC,
    PREY_VIEW_SHARE,
    SUBJECT_ENERGY,
    around,
    heading,
} from './memory-probe-scenarios.js';

const TWO_PI = 6.283185307179586;
const DEG = TWO_PI / 360;
const HUNTER_DISTANCE = 500;
/** Where the refuge ring's centre sits, from the subject, on the side away from the hunter. */
export const RING_DISTANCE = 400;
/** The ring circle the default config builds; the drill's `entered` test uses it whatever the overrides. */
export const RING_RADIUS = ringRadius(createConfig());
const TOXIC = FLORA_DEFAULTS.toxiccap;
const SAFE = FLORA_DEFAULTS.grass;
/** Share of the subject's view at which the two foods of `two-foods` sit. */
const TOXIC_SHARE = 0.4;
const SAFE_SHARE = 0.7;
/** The prey of `prey-too-big` holds this multiple of the subject's energy (its size follows its energy). */
const BIG_FACTOR = 2;

/**
 * @typedef {object} Drill
 * @property {string} name the drill's name
 * @property {string} scene the scene it detects (principles.md)
 * @property {number} spec the specialisation the subject is staged with
 * @property {boolean} needsHunter whether the subject must have a `canHunt` specialisation
 * @property {(rng: import('../sim/rng.js').Rng, view: number) => import('./memory-probe-run.js').Plan} plan one
 *   trial's staging, drawn from the drill's stream; `view` is the subject's ray length
 */

/**
 * @param {import('../sim/rng.js').Rng} rng the drill's stream
 * @param {number} lowDeg the smallest offset in degrees
 * @param {number} highDeg the largest offset in degrees
 * @returns {number} an offset in radians of either sign
 */
function offset(rng, lowDeg, highDeg) {
    const size = (lowDeg + nextFloat(rng) * (highDeg - lowDeg)) * DEG;
    return nextFloat(rng) < 0.5 ? -size : size;
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number[]} the alive food slots
 */
function aliveFoods(world) {
    const slots = [];
    for (let i = 0; i < world.foodAlive.length; i++) {
        if (world.foodAlive[i] === 1) {
            slots.push(i);
        }
    }
    return slots;
}

/**
 * @param {number} spec the subject's specialisation
 * @param {number} angle its heading
 * @returns {Record<string, any>} the subject at the arena's centre
 */
function subjectAt(spec, angle) {
    const energy = spec === PREDATOR_SPEC ? HUNTER_ENERGY : SUBJECT_ENERGY;
    return { role: 'subject', x: CENTRE_X, y: CENTRE_Y, angle, spec, energy };
}

/**
 * @param {Record<string, any>[]} agents the staged agents
 * @param {{x: number, y: number, hue?: number, toxicity?: number}[]} foods the foods
 * @param {{x: number, y: number, r: number}[]} [rocks] the rocks
 * @returns {import('./memory-probe-run.js').Plan['stage']} the stage
 */
function stage(agents, foods, rocks = []) {
    return { foods, rocks, agents };
}

/**
 * @param {string} name the drill's name
 * @param {{share: number, fromDeg: number, toDeg: number, maxTicks: number}} food where the one food sits
 * @returns {Drill} a forager drill won by eating the one food
 */
function foodDrill(name, { share, fromDeg, toDeg, maxTicks }) {
    return {
        name,
        scene: 'Leave a dying patch',
        spec: FORAGER_SPEC,
        needsHunter: false,
        plan(rng, view) {
            const angle = heading(rng);
            const food = around(angle + offset(rng, fromDeg, toDeg), share * view);
            const eaten = (/** @type {Record<string, any>} */ world) => aliveFoods(world).length === 0;
            return {
                stage: stage([subjectAt(FORAGER_SPEC, angle)], [food]),
                timing: null,
                scent: false,
                maxTicks,
                done: eaten,
                won: eaten,
            };
        },
    };
}

/** @type {Drill} the toxic item is nearer; the safe one is the right first meal */
const TWO_FOODS = {
    name: 'two-foods',
    scene: 'Season changes the map',
    spec: FORAGER_SPEC,
    needsHunter: false,
    plan(rng, view) {
        const angle = heading(rng);
        const toxic = around(angle + offset(rng, 0, 30), TOXIC_SHARE * view);
        const safe = around(angle + offset(rng, 40, 80), SAFE_SHARE * view);
        return {
            stage: stage(
                [subjectAt(FORAGER_SPEC, angle)],
                [
                    { ...toxic, hue: TOXIC.hue, toxicity: TOXIC.toxicity },
                    { ...safe, hue: SAFE.hue, toxicity: SAFE.toxicity },
                ],
            ),
            timing: null,
            scent: false,
            maxTicks: 600,
            done: (world) => aliveFoods(world).length < 2,
            won: (world) => {
                const left = aliveFoods(world);
                return left.length === 1 && world.foodTox[left[0]] > 0;
            },
        };
    },
};

/**
 * A fleeing prey can starve (it sprints), so a dead prey is not a kill; the sim's own credit for a deliberate kill is.
 * @param {Record<string, any>} world the world
 * @returns {boolean} whether the subject killed the prey
 */
function killed(world) {
    return world.alive[1] === 0 && world.deliberateKills[0] > 0;
}

/**
 * @param {string} name the drill's name
 * @param {{energy: number, maxTicks: number, abort: boolean}} prey the prey's energy, the length, and whether the
 *   drill is won by not biting
 * @returns {Drill} a predator drill with one scripted fleeing forager
 */
function preyDrill(name, { energy, maxTicks, abort }) {
    return {
        name,
        scene: abort ? 'Abort' : 'A real chase',
        spec: PREDATOR_SPEC,
        needsHunter: true,
        plan(rng, view) {
            const angle = heading(rng);
            const spot = around(angle + offset(rng, 0, 45), PREY_VIEW_SHARE * view);
            const prey = { role: 'prey', ...spot, angle: heading(rng), spec: FORAGER_SPEC, energy };
            let bitten = false;
            return {
                stage: stage([subjectAt(PREDATOR_SPEC, angle), prey], []),
                timing: null,
                scent: false,
                maxTicks,
                done: (world) => {
                    bitten ||= world.lastBiter[1] === world.genomeId[0];
                    return world.alive[0] === 0 || world.alive[1] === 0 || (abort && bitten);
                },
                won: (world) => (abort ? world.alive[0] === 1 && !bitten : killed(world)),
            };
        },
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {{x: number, y: number}} ring the ring's centre
 * @returns {boolean} whether the subject stands inside the ring circle
 */
function inRing(world, ring) {
    const dx = world.x[0] - ring.x;
    const dy = world.y[0] - ring.y;
    return Math.sqrt(dx * dx + dy * dy) <= RING_RADIUS;
}

/**
 * @param {{x: number, y: number}} centre the ring's centre
 * @returns {{x: number, y: number, r: number}[]} the ring's rocks on the circle `ringRadius` gives
 */
function ringRocks(centre) {
    return Array.from({ length: REFUGE_ROCKS }, (_, k) => {
        const theta = (TWO_PI * k) / REFUGE_ROCKS;
        return {
            x: centre.x + RING_RADIUS * detCos(theta),
            y: centre.y + RING_RADIUS * detSin(theta),
            r: REFUGE_ROCK_RADIUS,
        };
    });
}

/**
 * @param {boolean} withRing whether a refuge ring stands behind the subject
 * @returns {Drill} the drill of a forager with a hunter closing from 500 px
 */
function hunterDrill(withRing) {
    return {
        name: withRing ? 'rock-refuge' : 'hunter-closing',
        scene: withRing ? 'Refuge' : 'A real chase',
        spec: FORAGER_SPEC,
        needsHunter: false,
        plan(rng) {
            const theta = heading(rng);
            const hunter = { role: 'hunter', ...around(theta, HUNTER_DISTANCE) };
            const agents = [
                subjectAt(FORAGER_SPEC, heading(rng)),
                { ...hunter, angle: theta + TWO_PI / 2, spec: PREDATOR_SPEC, energy: HUNTER_ENERGY },
            ];
            const ring = around(theta + TWO_PI / 2, RING_DISTANCE);
            let entered = false;
            return {
                stage: stage(agents, [], withRing ? ringRocks(ring) : []),
                timing: null,
                scent: false,
                maxTicks: withRing ? 900 : 600,
                done: (world) => {
                    entered ||= inRing(world, ring);
                    return world.alive[0] === 0;
                },
                won: (world) => world.alive[0] === 1 && (!withRing || entered),
            };
        },
    };
}

/** The drills, in the doc's order. */
export const DRILLS = Object.freeze([
    foodDrill('food-ahead', { share: FOOD_VIEW_SHARE, fromDeg: 0, toDeg: 45, maxTicks: 300 }),
    foodDrill('food-behind', { share: 0.6, fromDeg: 120, toDeg: 180, maxTicks: 600 }),
    TWO_FOODS,
    preyDrill('prey-ahead', { energy: SUBJECT_ENERGY, maxTicks: 900, abort: false }),
    preyDrill('prey-too-big', { energy: BIG_FACTOR * HUNTER_ENERGY, maxTicks: 600, abort: true }),
    hunterDrill(false),
    hunterDrill(true),
]);
