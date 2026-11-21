// The `defend-caller` drill (docs/designs/training-loop.md, T34; docs/designs/role-budget.md, Phase 2): the scene of
// `playDefence` with a genome in the defender's seat. A scripted hunter creeps up on a standing forager, the forager calls
// alarm on seeing it, and the defender, beside the forager, must hear the call, run at the hunter and land its power before
// the kill (the shove, when `defenderRepel*` is on), or leave the caller alive by the end of the scene. The bar is the budget
// row `defender:predator`; at the defaults that row is impossible (the shove is off and the smoke comes too late), so the
// reference wins no trial and the drill has no passable bar there (`drill-role-validity.js` reports it).

import { nextFloat } from '../sim/rng.js';
import { SPEC } from '../sim/specs.js';
import { callerBrain, defenderBrain, pursuerBrain } from './chase-oracles.js';
import { ROLE, ROLE_ARENA, ROLE_CONFIG, SLOT, creeping, paramsOf, perWorld, turned } from './drill-role-staging.js';
import { heading } from './memory-probe-scenarios.js';
import { escortGap } from './role-budget-escort.js';
import { gapAtAwareness } from './role-budget-frame.js';
import { MODEL_DEFAULTS } from './role-budget-model.js';
import { MAX_TICKS } from './role-budget-timeline.js';
import { noteMeeting } from './role-scenes-defence.js';

/** The row the drill's bar is read from. */
export const DEFEND_ROW = 'defender:predator';
/**
 * The steps by which the drill is won: the defence (hear, turn, run, intercept; the turn is not read at the defaults) or the
 * smoke that hides the caller, the two goals of `--search` on the row.
 */
export const DEFEND_GOALS = Object.freeze([
    Object.freeze(['hear', 'turn', 'run', 'intercept']),
    Object.freeze(['smoke']),
]);

/**
 * @param {{interceptTick: number | null, repelTick: number | null, killTick: number | null}} ticks the readings
 * @returns {string | null} why the defender lost: it never reached the hunter, or its power landed too late (or never)
 */
export function lostReason(ticks) {
    return ticks.interceptTick === null ? 'never-reached' : 'late';
}

/**
 * One trial of the drill: the scene of `playDefence` turned to `angle`, the defender on the side `side` (1 or -1).
 * @param {Readonly<Record<string, any>>} config the validated config the trial runs under
 * @param {{angle: number, side: 1 | -1}} at the heading of the scene and the side the defender stands on
 * @returns {import('./memory-probe-run.js').Plan} the trial
 */
export function defendPlan(config, { angle, side }) {
    const [hunter, caller, defender] = paramsOf(config, 'predator', 'forager', 'defender');
    const { reactionTicks: reaction } = MODEL_DEFAULTS;
    const escort = escortGap(defender, caller, MODEL_DEFAULTS);
    const gap = gapAtAwareness(hunter, caller);
    const shoveOn = config.defenderRepelEnergy > 0 || config.defenderRepelImpulse > 0;
    const ticks = {
        interceptTick: /** @type {number | null} */ (null),
        repelTick: /** @type {number | null} */ (null),
        killTick: /** @type {number | null} */ (null),
    };
    let n = 0;
    const agents = [
        { role: ROLE.HUNTER, ...turned(angle, { x: 0, y: 0 }), angle, spec: SPEC.PREDATOR },
        { role: ROLE.OTHER, ...turned(angle, { x: gap, y: 0 }), angle, spec: SPEC.FORAGER },
        {
            role: 'subject',
            ...turned(angle, { x: gap, y: side * escort }),
            angle: angle - (side * Math.PI) / 2,
            spec: SPEC.DEFENDER,
        },
    ];
    return {
        stage: { foods: [], rocks: [], agents: /** @type {any} */ (agents) },
        timing: null,
        scent: false,
        maxTicks: MAX_TICKS,
        controllers: {
            [ROLE.HUNTER]: creeping(pursuerBrain({ pursuer: SLOT.HUNTER, evader: SLOT.OTHER, sprint: true }), {
                cruise: hunter.cap.cruise,
                angle,
            }),
            [ROLE.OTHER]: callerBrain({ caller: SLOT.OTHER, hunter: SLOT.HUNTER, seeGap: gap, reaction }),
        },
        trace: (won) => ({
            touchTick: ticks.interceptTick,
            shoveTick: ticks.repelTick,
            killTick: ticks.killTick,
            reason: won ? null : lostReason(ticks),
        }),
        done: (world) => {
            n += 1;
            noteMeeting(ticks, world, { n, shove: shoveOn });
            ticks.killTick = world.alive[SLOT.OTHER] === 0 ? n : null;
            return ticks.killTick !== null || world.alive[SLOT.HUNTER] === 0;
        },
        won: (world) =>
            world.alive[SLOT.OTHER] === 1 || (ticks.repelTick !== null && ticks.repelTick !== ticks.killTick),
    };
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the scripted defender: it stands until it hears the alarm, then runs at the
 *   hunter and holds `BITE` (`defenderBrain`), with the model's reaction and hearing threshold
 */
export function defenderReference() {
    const act = perWorld(() =>
        defenderBrain({
            defender: SLOT.SUBJECT,
            hunter: SLOT.HUNTER,
            reaction: MODEL_DEFAULTS.reactionTicks,
            threshold: MODEL_DEFAULTS.hearThreshold,
        }),
    );
    return { name: 'defender-oracle', id: 0, spec: SPEC.DEFENDER, weights: null, act };
}

/** @type {import('./drill-staging.js').RoleDrill} */
export const DEFEND_CALLER = {
    name: 'defend-caller',
    scene: 'A real chase',
    spec: SPEC.DEFENDER,
    needsHunter: false,
    arena: ROLE_ARENA,
    row: DEFEND_ROW,
    goals: DEFEND_GOALS,
    reference: defenderReference,
    plan: (rng, _view, config = ROLE_CONFIG) =>
        defendPlan(config, { angle: heading(rng), side: nextFloat(rng) < 0.5 ? -1 : 1 }),
};
