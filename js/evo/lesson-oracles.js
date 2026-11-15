// The lesson oracles (senses-and-motor.md, Lesson probes): for each drill, a scripted subject that reads the whole
// world state (positions, velocities, toxicity, the rocks) instead of its senses. An oracle's win share says what the
// body allows; the input-only reference (`js/evo/lesson-reference.js`) says what the senses allow. A detector: it
// scripts a subject for a probe and is never a fitness, a seed or an archive entry.

import { evaderBrain, steer } from './chase-oracles.js';
import { SEEK_THRUST, setOutput, write } from './scripted-parts.js';
import { OUTPUT_INDEX } from '../sim/brain-layout.js';

/** The subject's slot in every drill. */
const SUBJECT = 0;
/** The scripted hunter or prey's slot in the drills that have one. */
const OTHER = 1;
/** A wanted food is approached round an unwanted one by this many of its radii. */
const AVOID = 2;
/** The distance from the ring's centre at which the oracle stops and waits. */
const SETTLE = 40;
/** The hunter's distance inside which the fleeing oracle sprints (a sprint costs more than a store holds for a whole drill). */
const SPRINT_RANGE = 260;
/** The distance from a wall at which the fleeing oracle bends away from it. */
const WALL_MARGIN = 600;
/** Rocks beyond this coordinate are parked, not part of a ring (`stageWorld`). */
const PARKED_FROM = 10000;

/**
 * @param {Record<string, any>} world the world
 * @param {(world: Record<string, any>, food: number) => boolean} wanted whether a food is one the oracle goes for
 * @returns {number} the slot of the nearest wanted food, or -1 when none is alive
 */
function nearestFood(world, wanted) {
    let best = -1;
    let bestD = Infinity;
    for (let f = 0; f < world.foodAlive.length; f++) {
        if (world.foodAlive[f] === 1 && wanted(world, f)) {
            const dx = world.foodX[f] - world.x[SUBJECT];
            const dy = world.foodY[f] - world.y[SUBJECT];
            if (dx * dx + dy * dy < bestD) {
                bestD = dx * dx + dy * dy;
                best = f;
            }
        }
    }
    return best;
}

/**
 * Where to head to reach a target without touching a food the oracle does not want: straight at it, or, when an unwanted
 * food sits on the way, at a point beside that food on the side the straight line passes.
 * @param {Record<string, any>} world the world
 * @param {{target: number, wanted: (world: Record<string, any>, food: number) => boolean}} goal the food to reach and
 *   which foods are wanted
 * @returns {{x: number, y: number}} the aim, relative to the subject
 */
function aimAround(world, { target, wanted }) {
    const tx = world.foodX[target] - world.x[SUBJECT];
    const ty = world.foodY[target] - world.y[SUBJECT];
    const length = Math.sqrt(tx * tx + ty * ty) || 1;
    for (let f = 0; f < world.foodAlive.length; f++) {
        if (world.foodAlive[f] !== 1 || wanted(world, f)) {
            continue;
        }
        const ux = world.foodX[f] - world.x[SUBJECT];
        const uy = world.foodY[f] - world.y[SUBJECT];
        const along = (ux * tx + uy * ty) / length;
        const side = (tx * uy - ty * ux) / length;
        const clear = AVOID * world.foodRadius[f];
        if (along > 0 && along < length && Math.abs(side) < clear) {
            const away = side > 0 ? -1 : 1;
            return { x: ux + (away * clear * -ty) / length, y: uy + (away * clear * tx) / length };
        }
    }
    return { x: tx, y: ty };
}

/**
 * @param {(world: Record<string, any>, food: number) => boolean} wanted which foods the oracle eats
 * @returns {(world: Record<string, any>) => void} a controller that walks to the nearest wanted food, round any
 *   unwanted one, and bites
 */
function eater(wanted) {
    return (world) => {
        const target = nearestFood(world, wanted);
        if (target < 0) {
            write(world, SUBJECT, 0, 0);
            return;
        }
        write(world, SUBJECT, SEEK_THRUST * 2, steer(world, SUBJECT, aimAround(world, { target, wanted })));
        setOutput(world, SUBJECT, OUTPUT_INDEX.BITE, 1);
    };
}

/**
 * @param {Record<string, any>} world the world
 * @returns {{x: number, y: number} | null} the centre of the staged ring's rocks, or null when there are none
 */
function ringCentre(world) {
    let n = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < world.obsX.length; i++) {
        if (world.obsX[i] < PARKED_FROM && world.obsY[i] < PARKED_FROM) {
            n += 1;
            x += world.obsX[i];
            y += world.obsY[i];
        }
    }
    return n === 0 ? null : { x: x / n, y: y / n };
}

/**
 * @param {Record<string, any>} world the world
 * @returns {void} runs for the oracle of `rock-refuge`: flees at a sprint to the ring's centre, or runs from the hunter
 *   when there is no ring
 */
function refugeRunner(world) {
    const centre = ringCentre(world);
    if (centre === null) {
        runner(world);
        return;
    }
    const aim = { x: centre.x - world.x[SUBJECT], y: centre.y - world.y[SUBJECT] };
    if (aim.x * aim.x + aim.y * aim.y < SETTLE * SETTLE) {
        write(world, SUBJECT, 0, 0);
        return;
    }
    write(world, SUBJECT, 1, steer(world, SUBJECT, aim));
    setOutput(world, SUBJECT, OUTPUT_INDEX.SPRINT, 1);
}

/**
 * @param {Record<string, any>} world the world
 * @returns {void} runs for the oracle of `prey-ahead`: pure pursuit of the prey's exact position at a sprint, turning
 *   at full rate to either side as the input reader does (the sim counts a kill as deliberate only after a visible
 *   turn towards the prey, `isDeliberate` in js/sim/merit-state.js) and biting. A heuristic: it wins 0.19 to 0.38 of
 *   `prey-ahead` where the input reader wins 0.75, so on that drill the oracle is a lower bound on the body, not the
 *   bound
 */
function striker(world) {
    const aim = { x: world.x[OTHER] - world.x[SUBJECT], y: world.y[OTHER] - world.y[SUBJECT] };
    const turn = steer(world, SUBJECT, aim);
    write(world, SUBJECT, 1, Math.abs(turn) < 0.02 ? 0 : Math.sign(turn));
    setOutput(world, SUBJECT, OUTPUT_INDEX.SPRINT, 1);
    setOutput(world, SUBJECT, OUTPUT_INDEX.BITE, 1);
}

/**
 * @param {Record<string, any>} world the world
 * @returns {void} runs for the oracle of `hunter-closing`: away from the hunter, sprinting only when it is near
 */
function runner(world) {
    const dx = world.x[OTHER] - world.x[SUBJECT];
    const dy = world.y[OTHER] - world.y[SUBJECT];
    evaderBrain({
        pursuer: OTHER,
        evader: SUBJECT,
        sprint: dx * dx + dy * dy < SPRINT_RANGE * SPRINT_RANGE,
        wallMargin: WALL_MARGIN,
    })(world);
}

/** @type {Readonly<Record<string, () => (world: Record<string, any>) => void>>} each drill's oracle, by drill name */
const ORACLES = Object.freeze({
    'food-ahead': () => eater(() => true),
    'food-behind': () => eater(() => true),
    'two-foods': () => eater((world, food) => world.foodTox[food] === 0),
    'prey-ahead': () => striker,
    'prey-too-big': () => (world) => write(world, SUBJECT, 0, 0),
    'hunter-closing': () => runner,
    'rock-refuge': () => refugeRunner,
});

/** The drills that have an oracle. */
export const ORACLE_DRILLS = Object.freeze(Object.keys(ORACLES));

/**
 * @param {string} drill a drill's name
 * @returns {import('./memory-probe-run.js').Subject} a scripted subject that plays the drill with the world state
 * @throws {Error} on a drill with no oracle
 */
export function oracleSubject(drill) {
    const make = /** @type {Record<string, any>} */ (ORACLES)[drill];
    if (make === undefined) {
        throw new Error(`oracle: expected one of ${ORACLE_DRILLS.join(', ')}, got "${drill}"`);
    }
    const run = make();
    return {
        name: `oracle:${drill}`,
        id: 0,
        spec: null,
        weights: null,
        act: (world) => {
            if (world.alive[SUBJECT] === 1) {
                run(world);
            }
        },
    };
}
