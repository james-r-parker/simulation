// The drills (training.md, Drills): fixed scenarios that test one skill of a genome, in the shape of the memory-probe
// scenarios. A drill's score is a detector; it never enters fitness, merit, mate rank or archive rank.

import { createConfig } from '../sim/config.js';
import { FLORA_DEFAULTS } from '../sim/config-flora.js';
import { detCos, detSin } from '../sim/det-math.js';
import { REFUGE_ROCKS, REFUGE_ROCK_RADIUS, ringRadius } from '../sim/terrain.js';
import { SOCIAL_DRILLS } from './drill-scenarios-social.js';
import { offset, preyDrill, stage, subjectAt } from './drill-staging.js';
import {
    FOOD_VIEW_SHARE,
    FORAGER_SPEC,
    HUNTER_ENERGY,
    PREDATOR_SPEC,
    SUBJECT_ENERGY,
    around,
    heading,
} from './memory-probe-scenarios.js';

const TWO_PI = 6.283185307179586;
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
/** The forager's `sprintBoost` in `prey-weak` and the `hunt-weak` stage (1 on the defaults; the fleer's sprint is 12 at 1). */
export const WEAK_SPRINT_BOOST = 0.2;
/** The forager's `sprintBoost` in `prey-mid` and the `hunt-mid` stage, between `WEAK_SPRINT_BOOST` and the default 1. */
export const MID_SPRINT_BOOST = 0.3;
/**
 * @param {number} sprintBoost the forager's sprint (the scripted fleer of a hunting drill is one)
 * @returns {Readonly<{specialisations: {forager: {sprintBoost: number}}}>} an arena that sets it: the `arena` of `prey-weak`
 *   and `prey-mid`, and the config the adaptive-difficulty steering read runs `prey-ahead` under (`js/evo/adaptive-difficulty.js`)
 */
export const sprintArena = (sprintBoost) => Object.freeze({ specialisations: { forager: { sprintBoost } } });
const WEAK_PREY_ARENA = sprintArena(WEAK_SPRINT_BOOST);
/** The prey of `prey-too-big` holds this multiple of the subject's energy. */
const BIG_FACTOR = 2;

/**
 * The base size of the `prey-too-big` prey. A forager's size is capped by its store (about 33), and a loaded hunter's
 * is 31, which clears `huntSizeRatio` (0.8), so energy alone leaves the prey bitable. At 60 the prey is over 1.25 times
 * the biggest hunter the drill can stage, so `couldBite` is false.
 */
const BIG_BASE_SIZE = 60;

/**
 * @param {Record<string, any>} world the world
 * @returns {number} how many food items are alive (the food drills' `done` check runs every tick: allocates nothing)
 */
function aliveFoodCount(world) {
    const alive = world.foodAlive;
    let count = 0;
    for (let i = 0; i < alive.length; i++) {
        count += alive[i];
    }
    return count;
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number} the one alive food slot of a world with exactly one, or -1
 */
function onlyAliveFood(world) {
    const alive = world.foodAlive;
    let found = -1;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            if (found >= 0) {
                return -1;
            }
            found = i;
        }
    }
    return found;
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
            const eaten = (/** @type {Record<string, any>} */ world) => aliveFoodCount(world) === 0;
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
            done: (world) => aliveFoodCount(world) < 2,
            won: (world) => {
                const left = onlyAliveFood(world);
                return left >= 0 && world.foodTox[left] > 0;
            },
        };
    },
};

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
export function ringRocks(centre) {
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

/** @typedef {import('./drill-staging.js').Drill} Drill */

/** The drills, in the doc's order: the seven of training.md, then the social four. */
export const DRILLS = Object.freeze([
    foodDrill('food-ahead', { share: FOOD_VIEW_SHARE, fromDeg: 0, toDeg: 45, maxTicks: 300 }),
    foodDrill('food-behind', { share: 0.6, fromDeg: 120, toDeg: 180, maxTicks: 600 }),
    TWO_FOODS,
    preyDrill('prey-ahead', { energy: SUBJECT_ENERGY, maxTicks: 900, abort: false }),
    preyDrill('prey-too-big', {
        energy: BIG_FACTOR * HUNTER_ENERGY,
        maxTicks: 600,
        abort: true,
        baseSize: BIG_BASE_SIZE,
    }),
    hunterDrill(false),
    hunterDrill(true),
    ...SOCIAL_DRILLS,
    // After the social four so `DRILLS.slice(7, 11)` stays them. The contact lesson of `hunt-contact` (T35): the `prey-ahead`
    // staging with a prey that does not run; `prey-ahead` stays the lesson of `hunt`.
    preyDrill('prey-adrift', { energy: SUBJECT_ENERGY, maxTicks: 900, abort: false, role: 'adrift' }),
    // The rung between that and `prey-ahead` (T40): the scripted fleer with its sprint cut to `WEAK_SPRINT_BOOST`, a weakened
    // prey a young hunter can run down; the same staging, in the arena that cuts the forager's sprint.
    { ...preyDrill('prey-weak', { energy: SUBJECT_ENERGY, maxTicks: 900, abort: false }), arena: WEAK_PREY_ARENA },
    // The rung between that and `prey-ahead` (E-TS-1f): the same fleer at `MID_SPRINT_BOOST`.
    {
        ...preyDrill('prey-mid', { energy: SUBJECT_ENERGY, maxTicks: 900, abort: false }),
        arena: sprintArena(MID_SPRINT_BOOST),
    },
]);
