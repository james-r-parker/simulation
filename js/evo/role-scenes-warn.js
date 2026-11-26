// The scripted warning in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): a hunter oracle that
// creeps up on a forager, a scout oracle that calls alarm on seeing it, and a forager oracle that runs once it hears. Each
// reading carries the field name of the formula it checks (`WarnTimeline` of role-budget-warn.js), so `--check` compares
// field by field.

import { OUTPUT_COUNT } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { callerBrain, evaderBrain, fleerBrain, pursuerBrain, stalkerBrain } from './chase-oracles.js';
import { gapAtSight } from './role-budget-frame.js';
import { norm } from './role-budget-kinematics.js';
import { roleParams } from './role-budget-params.js';
import { runScene } from './role-scenes-defence.js';
import { viewReach } from './role-budget-senses.js';

/** The slots of the scene. */
const HUNTER = 0;
const PREY_SLOT = 1;
const CALLER_SLOT = 2;
/** The ticks the forager is followed after it starts to run: the largest gap a hunter closes is read over 250. */
const CHASE_TICKS = 250;

/**
 * @typedef {object} WarnScene
 * @property {{alarmTick: number, heardTick: number, startTick: number, gapAtStart: number, gapAtRun: number | null,
 *   killTick: number | null}} ticks the ticks and gaps the formula names
 * @property {{caught: boolean}} outcome whether the hunter killed the forager before the follow-up ended
 */

/**
 * Stages the hunter at the arena's centre heading +x at its cruise speed (it is creeping), the forager `gapSee` ahead of it
 * and side-on to it (a grazing body), and the scout `side` beside the forager and as far from the hunter as the forager is,
 * facing it.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{side: number, gapSee: number}} at the scout's distance from the forager, and the hunter's gap to both
 * @returns {ReturnType<typeof stageArena>} the arena
 */
function stage(config, { side, gapSee }) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const { x, y } = ARENA_CENTRE;
    const along = Math.sqrt(gapSee * gapSee - side * side);
    const staged = stageArena(config, [
        { spec: specs.predator.index, x, y, angle: 0 },
        { spec: specs.forager.index, x: x + gapSee, y, angle: Math.PI / 2 },
        { spec: specs.scout.index, x: x + along, y: y + side, angle: Math.PI },
    ]);
    staged.world.vx[HUNTER] = roleParams(config, 'predator').cap.cruise;
    return staged;
}

/**
 * Notes what the formula names after step `n`: the tick the scout's alarm fired, the forager's gap to the hunter when it
 * started to move and when the hunter started to sprint, and the tick the forager died.
 * @param {WarnScene['ticks']} ticks the readings, updated in place
 * @param {Record<string, any>} world the world after the step
 * @param {{n: number, start: number, runAt: number}} at the step (from 1), the tick the forager moves (-1: never) and the tick
 *   the forager has turned and runs
 * @returns {void}
 */
function note(ticks, world, { n, start, runAt }) {
    const gap = norm(world.x[PREY_SLOT] - world.x[HUNTER], world.y[PREY_SLOT] - world.y[HUNTER]);
    if (ticks.alarmTick < 0 && world.alarmTimer[CALLER_SLOT] > 0) {
        ticks.alarmTick = n - 1;
    }
    if (Number.isNaN(ticks.gapAtStart) && start >= 0 && world.tick >= start) {
        ticks.gapAtStart = gap;
    }
    if (ticks.gapAtRun === null && world.tick >= runAt) {
        ticks.gapAtRun = gap;
    }
    ticks.killTick = world.alive[PREY_SLOT] === 0 ? n : null;
}

/**
 * Plays the warning: the scout sees the hunter at tick 0 (the hunter is `gapSee` from it), calls alarm `reaction` ticks later,
 * the forager hears it, turns and runs, and the hunter keeps creeping until `goAt` and then sprints at it.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{reaction: number, threshold: number, side: number, goAt: number, runAt?: number}} options the brains' reaction
 *   ticks, the loudness the forager acts on, the scout's distance from the forager, the tick the hunter starts to sprint and the
 *   tick the forager has turned (default `goAt`), at which the gap is read and from which the follow-up runs
 * @returns {WarnScene} the ticks, the gaps and the outcome, from the real sim
 */
export function playWarning(config, { reaction, threshold, side, goAt, runAt = goAt }) {
    const [hunter, scout] = ['predator', 'scout'].map((s) => roleParams(config, s));
    const gapSee = viewReach(scout, 0) + hunter.size;
    const staged = stage(config, { side, gapSee });
    const fleer = fleerBrain({ forager: PREY_SLOT, hunter: HUNTER, reaction, threshold });
    const brains = [
        stalkerBrain({ hunter: HUNTER, prey: PREY_SLOT, goAt }),
        // one px over, since the scout's distance is a square root and sees the hunter on the first tick
        callerBrain({ caller: CALLER_SLOT, hunter: HUNTER, seeGap: gapSee + 1, reaction }),
        fleer,
    ];
    const ticks = {
        alarmTick: -1,
        heardTick: -1,
        startTick: -1,
        gapAtStart: NaN,
        gapAtRun: /** @type {number | null} */ (null),
        killTick: /** @type {number | null} */ (null),
    };
    runScene(staged, {
        brains,
        observe(world, n) {
            note(ticks, world, { n, start: fleer.state.startTick, runAt });
            return (
                world.alive[PREY_SLOT] === 0 ||
                world.alive[HUNTER] === 0 ||
                world.tick > Math.max(goAt, runAt) + CHASE_TICKS
            );
        },
    });
    ticks.heardTick = fleer.state.heardTick;
    ticks.startTick = fleer.state.startTick;
    return { ticks, outcome: { caught: ticks.killTick !== null } };
}

/**
 * The reactive hunter's chase of the forager that has turned (docs/designs/role-budget.md, T30): the frame of
 * `maxCatchableGap` at `tier: 'reactive'` played in the sim. The hunter starts at rest at the arena's centre, does nothing
 * for `reaction` ticks and then pursues at its sprint, flat out; the forager starts `max(sight, aware)` ahead of it, moving as
 * it is when it has turned (`preyStart`), holds nothing until the gap has fallen to `aware`, and then runs as the oracle
 * evader does.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{reaction: number, aware: number, preyStart?: {speed: number, offset: number}}} options the hunter's reaction ticks,
 *   the gap at which the forager is aware (the gap it has when it runs) and how it moves then (default: at rest, facing away)
 * @returns {{outcome: {caught: boolean}, gap: number}} whether the forager was killed within the follow-up, and the start gap
 */
export function playReactiveFlight(config, { reaction, aware, preyStart = { speed: 0, offset: 0 } }) {
    const [hunter, forager] = ['predator', 'forager'].map((s) => roleParams(config, s));
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const gap = Math.max(gapAtSight(hunter, forager), aware);
    const { x, y } = ARENA_CENTRE;
    const staged = stageArena(config, [
        { spec: specs.predator.index, x, y, angle: 0 },
        { spec: specs.forager.index, x: x + gap, y, angle: preyStart.offset },
    ]);
    staged.world.vx[PREY_SLOT] = preyStart.speed * detCos(preyStart.offset);
    staged.world.vy[PREY_SLOT] = preyStart.speed * detSin(preyStart.offset);
    const chase = pursuerBrain({ pursuer: HUNTER, evader: PREY_SLOT, sprint: true });
    const flee = evaderBrain({ pursuer: HUNTER, evader: PREY_SLOT, sprint: true });
    let killed = false;
    runScene(staged, {
        brains: [
            (world) => (world.tick >= reaction ? chase(world) : standing(world, HUNTER)),
            (world) => (gapOf(world) > aware ? standing(world, PREY_SLOT) : flee(world)),
        ],
        observe(world) {
            killed = world.alive[PREY_SLOT] === 0;
            return killed || world.alive[HUNTER] === 0 || world.tick > reaction + CHASE_TICKS;
        },
    });
    return { outcome: { caught: killed }, gap };
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number} the centre gap from the hunter to the forager
 */
function gapOf(world) {
    return norm(world.x[PREY_SLOT] - world.x[HUNTER], world.y[PREY_SLOT] - world.y[HUNTER]);
}

/**
 * Holds nothing: a body that has not acted yet.
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @returns {void}
 */
function standing(world, slot) {
    world.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);
}
