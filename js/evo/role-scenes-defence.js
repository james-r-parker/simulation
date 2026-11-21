// The scripted defence in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): a hunter oracle on a
// standing caller that calls alarm, and a defender oracle that runs at the hunter once it hears. Each reading carries the
// field name of the formula it checks (`Defence` of role-budget-defence.js), so `--check` compares field by field.

import { inJaws } from '../sim/bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { step } from '../sim/step.js';
import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { callerBrain, defenderBrain, pursuerBrain } from './chase-oracles.js';
import { gapAtAwareness } from './role-budget-frame.js';
import { norm } from './role-budget-kinematics.js';
import { roleParams } from './role-budget-params.js';
import { MAX_TICKS } from './role-budget-timeline.js';

/** A defender this far off hears nothing: the scene without a defender. */
const ABSENT_SIDE = 5000;

/**
 * Steps a staged world until `observe` says stop or `MAX_TICKS` pass.
 * @param {{world: Record<string, any>, policy: any}} staged the staged arena
 * @param {{brains: Array<(world: Record<string, any>) => void>, observe: (world: Record<string, any>, n: number) => boolean}} play
 *   the oracle brains, each run in order every tick, and the reading after step `n` (from 1), which returns true to stop
 * @returns {void}
 */
export function runScene({ world, policy }, { brains, observe }) {
    const brain = (/** @type {Record<string, any>} */ w) => brains.forEach((b) => b(w));
    for (let n = 1; n <= MAX_TICKS; n++) {
        step(world, policy, { brain });
        if (observe(world, n)) {
            return;
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} a a slot
 * @param {number} b another slot
 * @returns {boolean} whether the two bodies touch: their centres are no further apart than their sizes (a hair over, since the
 *   contact is resolved to exactly touching by the end of the tick)
 */
export function touching(world, a, b) {
    const gap = norm(world.x[a] - world.x[b], world.y[a] - world.y[b]);
    return gap <= world.size[a] + world.size[b] + 1;
}

/**
 * Stages the hunter, the standing caller and the defender of the defence scenes: the hunter at the arena's centre heading +x at
 * its cruise speed (it was creeping), the forager `gapAtAwareness` ahead of it facing away, and the defender where `place`
 * says, relative to the hunter.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {(at: {gap: number, caller: import('./role-budget-params.js').RoleParams,
 *   defender: import('./role-budget-params.js').RoleParams}) => {x: number, y: number, angle: number}} place where the
 *   defender stands: its offset from the hunter and its heading
 * @returns {{staged: ReturnType<typeof stageArena>, hunter: import('./role-budget-params.js').RoleParams,
 *   caller: import('./role-budget-params.js').RoleParams, defender: import('./role-budget-params.js').RoleParams, gap: number,
 *   origin: {x: number, y: number}}} the arena and what it was built from
 */
export function stageTrio(config, place) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const [hunter, caller, defender] = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
    const gap = gapAtAwareness(hunter, caller);
    const { x, y } = ARENA_CENTRE;
    const at = place({ gap, caller, defender });
    const staged = stageArena(config, [
        { spec: specs.predator.index, x, y, angle: 0 },
        { spec: specs.forager.index, x: x + gap, y, angle: 0 },
        { spec: specs.defender.index, x: x + at.x, y: y + at.y, angle: at.angle },
    ]);
    staged.world.vx[0] = hunter.cap.cruise;
    return { staged, hunter, caller, defender, gap, origin: { x, y } };
}

/**
 * @typedef {object} DefenceScene
 * @property {{alarmTick: number, heardTick: number, startTick: number, contactTick: number | null,
 *   interceptTick: number | null, repelTick: number | null, killTick: number | null}} ticks the ticks the formula names
 * @property {{killed: boolean, defenderArrivedFirst: boolean}} outcome whether the caller died, and whether the defender
 *   touched the hunter before it did
 */

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{reaction: number, threshold: number, side: number, absent?: boolean}} options the brains' reaction ticks, the
 *   loudness the defender acts on, the defender's distance from the caller, and whether it is left out
 * @returns {{brains: Array<(world: Record<string, any>) => void>, staged: ReturnType<typeof stageArena>,
 *   defender: ReturnType<typeof defenderBrain>}} the arena (hunter, caller, defender) and its brains
 */
function stage(config, { reaction, threshold, side, absent = false }) {
    const { staged, gap } = stageTrio(config, ({ gap: g }) => ({
        x: g,
        y: absent ? ABSENT_SIDE : side,
        angle: -Math.PI / 2,
    }));
    const defender = defenderBrain({ defender: 2, hunter: 0, reaction, threshold });
    const brains = [
        pursuerBrain({ pursuer: 0, evader: 1, sprint: true }),
        callerBrain({ caller: 1, hunter: 0, seeGap: gap, reaction }),
        defender,
    ];
    return { brains, staged, defender };
}

/**
 * Notes the first tick the defender touches the hunter, and the first at which it can shove it: the shove is on, the defender
 * holds `BITE` and the hunter is in its jaws (`tryDefenderRepel`, read from the world as the sim reads it).
 * @param {{interceptTick: number | null, repelTick: number | null}} ticks the readings, updated in place
 * @param {Record<string, any>} world the world after the tick
 * @param {{n: number, shove: boolean}} at the tick (from 1) and whether the shove is on
 * @returns {void}
 */
function noteMeeting(ticks, world, { n, shove }) {
    if (!touching(world, 2, 0)) {
        return;
    }
    ticks.interceptTick ??= n;
    const holds = world.outputs[2 * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0;
    ticks.repelTick ??= shove && holds && inJaws(world, 2, 0) ? n : null;
}

/**
 * Plays the defence: the hunter creeps up on the standing caller from its awareness gap at cruise speed, the caller calls
 * alarm `reaction` ticks after it sees the hunter, and the defender, beside the caller, runs at the hunter once it hears.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig` (the shove is its `defenderRepel*` keys)
 * @param {{reaction: number, threshold: number, side: number, absent?: boolean}} options the brains' reaction ticks, the
 *   loudness the defender acts on, the defender's distance from the caller and whether it is left out
 * @returns {DefenceScene} the ticks and the outcome, from the real sim
 */
export function playDefence(config, options) {
    const { brains, staged, defender } = stage(config, options);
    const ticks = {
        alarmTick: -1,
        heardTick: -1,
        startTick: -1,
        contactTick: /** @type {number | null} */ (null),
        interceptTick: /** @type {number | null} */ (null),
        repelTick: /** @type {number | null} */ (null),
        killTick: /** @type {number | null} */ (null),
    };
    const shove = config.defenderRepelEnergy > 0 || config.defenderRepelImpulse > 0;
    runScene(staged, {
        brains,
        observe(world, n) {
            ticks.alarmTick = ticks.alarmTick < 0 && world.alarmTimer[1] > 0 ? n - 1 : ticks.alarmTick;
            noteMeeting(ticks, world, { n, shove });
            ticks.contactTick ??= touching(world, 0, 1) ? n : null;
            ticks.killTick = world.alive[1] === 0 ? n : null;
            return world.alive[1] === 0 || world.alive[0] === 0;
        },
    });
    ticks.heardTick = defender.state.heardTick;
    ticks.startTick = defender.state.startTick;
    const arrival = shove ? ticks.repelTick : ticks.interceptTick;
    return {
        ticks,
        outcome: {
            killed: ticks.killTick !== null,
            defenderArrivedFirst: arrival !== null && (ticks.killTick === null || arrival < ticks.killTick),
        },
    };
}
