// The scout against a hunter creeping up on the herd (docs/designs/role-budget.md, "Phase 3 steps"): see, hear, warn, turn and
// run, each a slack in ticks. Pure: it reads `RoleParams` and the model. The scout and the forager stand together on the
// hunter's line of approach and the hunter creeps at its cruise speed, so every tick of delay anywhere in the chain costs the
// forager `cap.cruise` px of its gap, which is why the slack of one step is read from a closed form and not a bisection.

import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { createBody, bite } from './role-budget-body.js';
import { gapAtAwareness, maxCatchableGap } from './role-budget-frame.js';
import { swingTicks } from './role-budget-kinematics.js';
import { hearLoudness, hearWindow, seeLead, viewReach } from './role-budget-senses.js';

/** The steps of the scout's row, in order. */
export const WARN_STEPS = Object.freeze(['see', 'hear', 'warn', 'turn', 'run']);

/** The turn a grazing forager makes to face away from the hunter: it is side-on (the 90 degrees of the anchors). */
export const FORAGER_TURN = Math.PI / 2;

/**
 * @typedef {object} WarnTimeline the warning chain, in ticks from the tick the scout's view first holds the hunter
 * @property {number} gapSee the centre gap at which the scout sees the hunter: its reach ahead plus the hunter's size
 * @property {number} alarmTick the tick the scout's alarm fires
 * @property {number} heardTick the tick the forager acts on the call (-1: it never hears)
 * @property {number} startTick the tick the forager starts to turn (-1: never)
 * @property {number} runTick the tick the forager has turned and starts to run (-1: never)
 * @property {number} gapAtStart the centre gap from the hunter to the forager when it starts to turn
 * @property {number} gapAtRun the centre gap when it starts to run
 */

/**
 * @typedef {object} WarnBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `scout:predator`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells the five cells
 * @property {WarnTimeline} chain the chain with no extra delay
 * @property {{own: number, catchable: number, speed: number}} gaps the gap at which the forager would see the hunter itself,
 *   the largest awareness gap the hunter still closes on it (`maxCatchableGap`) and the hunter's creeping speed
 * @property {{plain: number, alarmed: number}} bites the bites a hunter needs to kill a forager, and with its alarm seen
 * @property {string | null} binding the step of least slack
 */

/** @typedef {Record<string, number>} Delays ticks added at one step of the chain (`see`, `hear`, `turn`, `run`) */

/**
 * The warning chain: the hunter has reached `gapSee`, the scout's alarm fires `reactionTicks` later, the forager tests the
 * call one tick after that (plus the `hear` delay) and acts `reactionTicks` after hearing it, turns through `FORAGER_TURN`
 * and runs; the hunter creeps at its cruise speed throughout.
 * @param {{scout: import('./role-budget-params.js').RoleParams, forager: import('./role-budget-params.js').RoleParams,
 *   hunter: import('./role-budget-params.js').RoleParams}} bodies the scout, the forager and the hunter
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {Delays} [delays] ticks added at one step
 * @returns {WarnTimeline} the chain; a forager that cannot hear the call reads -1 ticks and no gaps beyond the alarm
 */
export function warnTimeline({ scout, forager, hunter }, model, delays = {}) {
    const gapSee = viewReach(scout, 0) + hunter.size;
    const seen = delays.see ?? 0;
    const hear = delays.hear ?? 0;
    const alarmTick = seen + model.reactionTicks;
    const audible = hearLoudness(model.defenderGap, hear, scout) > model.hearThreshold;
    const heardTick = audible ? alarmTick + 1 + hear : -1;
    const startTick = audible ? heardTick + model.reactionTicks : -1;
    const turn = Math.ceil(swingTicks(FORAGER_TURN, forager.turnRate.start)) + (delays.turn ?? 0);
    const runTick = audible ? startTick + turn + (delays.run ?? 0) : -1;
    const at = (/** @type {number} */ tick) => gapSee - hunter.cap.cruise * tick;
    return { gapSee, alarmTick, heardTick, startTick, runTick, gapAtStart: at(startTick), gapAtRun: at(runTick) };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} forager the forager
 * @param {boolean} alarmed whether the forager's alarm is seen (`alarmBiteShare` cuts the bite)
 * @returns {number} the bites the hunter lands to kill a forager at its start energy
 */
function bitesToKill(hunter, forager, alarmed) {
    const h = createBody(hunter, { x: 0, y: 0, angle: 0 });
    const p = createBody(forager, { x: 1, y: 0, angle: 0 });
    const tally = { bites: 0, income: 0, kick: 0 };
    let killed = false;
    while (!killed && tally.bites < SLACK_CAP) {
        killed = bite(h, p, tally, alarmed);
    }
    return tally.bites;
}

/**
 * @param {number} px a length in px
 * @param {number} speed the hunter's creeping speed
 * @returns {number | null} the ticks it is worth, rounded down and capped at `SLACK_CAP`; null when negative
 */
function ticksOf(px, speed) {
    return px < 0 ? null : Math.min(SLACK_CAP, Math.floor(px / speed));
}

/**
 * The scout's budget against a hunter closing on a forager. The slack of `run` (and of the `turn` before it) is the ticks
 * the forager's gap at the start of its flight exceeds `maxCatchableGap` by, over the hunter's speed; `warn` the ticks the
 * warning reaches the forager before it would see the hunter itself; `see` the lead the scout's reach has on the forager's
 * (the hunter's size cancels); `hear` the slack of `run`, within the ticks the call is still audible.
 * @param {import('./role-budget-params.js').RoleParams} scout the scout
 * @param {import('./role-budget-params.js').RoleParams} forager the forager
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {WarnBudget} the budget
 */
export function budgetWarn(scout, forager, hunter, model) {
    const chain = warnTimeline({ scout, forager, hunter }, model);
    const speed = hunter.cap.cruise;
    const own = gapAtAwareness(hunter, forager);
    const catchable = maxCatchableGap(hunter, forager, { model });
    const heard = chain.heardTick >= 0;
    const run = heard ? ticksOf(chain.gapAtRun - catchable, speed) : null;
    const audible = hearWindow(model.defenderGap, scout, model.hearThreshold).ticks - 1;
    const cells = {
        see: cell(ticksOf(seeLead(scout, forager, Math.PI), speed), model),
        hear: heard ? cell(Math.min(run ?? SLACK_CAP, audible), model) : cell(null, model),
        warn: heard ? cell(ticksOf(chain.gapAtStart - own, speed), model) : cell(undefined, model),
        turn: heard && run !== null ? cell(run, model) : cell(undefined, model),
        run: heard ? cell(run, model, { distance: chain.gapAtRun - catchable }) : cell(undefined, model),
    };
    const row = rowOf('scout:predator', cells);
    return {
        row,
        cells,
        chain,
        gaps: { own, catchable, speed },
        bites: { plain: bitesToKill(hunter, forager, false), alarmed: bitesToKill(hunter, forager, true) },
        binding: row.binding,
    };
}
