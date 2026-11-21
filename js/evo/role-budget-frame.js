// The frames of the chase budget (docs/designs/role-budget.md, "Phase 1 steps"): how a performer tier and a prey bound
// become a `chaseTimeline` start, the awareness gap a hunter can creep to unseen, and `maxCatchableGap`, the largest
// awareness gap the hunter still closes. Pure; every function reads `RoleParams` records and the model.

import { JINK_RANGE } from './chase-oracles.js';
import { reliableView, viewReach } from './role-budget-senses.js';
import { chaseTimeline } from './role-budget-timeline.js';

/** The largest start gap the bisection looks at: `MAX_TICKS` of the fastest sprint, inside the arena. */
const GAP_LIMIT = 3600;
/** The width the bisection stops at, in px. */
const GAP_RESOLUTION = 0.05;
/** The step of the walk, in px, and the smallest gap it looks at (bodies about to touch). */
const STEP = 15;
const MIN_GAP = 40;

/**
 * @typedef {'perfect' | 'reactive' | 'naive'} Tier
 * @typedef {'straight' | 'broken'} Bound
 * @typedef {object} Frame what a chase is played as
 * @property {Tier} [tier] the performer (default `perfect`)
 * @property {Bound} [bound] the prey's play (default `broken`)
 * @property {number} [bearing] the angle of the line to the prey from the hunter's heading (default 0)
 * @property {import('./role-budget-model.js').RoleModel} model the model options
 * @property {{see?: number, turn?: number, run?: number}} [delays] ticks added at one step
 */

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @returns {number} the centre gap at which the prey, seen from behind, first sees the hunter: its rear reach plus the
 *   hunter's size, how close the hunter can creep unseen
 */
export function gapAtAwareness(hunter, prey) {
    return viewReach(prey, Math.PI) + hunter.size;
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {boolean} [reliable] whether the hunter acts only inside `reliableView` of the prey
 * @returns {number} the centre gap at which the hunter first sees the prey: its reach ahead plus the prey's size, or the
 *   range at which two neighbouring rays cannot both miss it
 */
export function gapAtSight(hunter, prey, reliable = false) {
    return reliable ? reliableView(hunter, prey.size) : viewReach(hunter, 0) + prey.size;
}

/**
 * @param {Frame} frame the frame
 * @returns {import('./role-budget-timeline.js').TimelineOptions['prey']} the prey's play for the bound
 */
function preyPlay({ bound = 'broken', model }) {
    const sprint = model.preySprint === 'always' ? 'always' : 'rationed';
    return bound === 'straight' ? { sprint, jink: 0 } : { sprint, jink: JINK_RANGE, breakAngle: model.breakAngle };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {Frame} frame the frame
 * @returns {{wait: number, runAt: number, slowTicks: number, seeGap: number}} the hunter's delays, and the gap inside
 *   which it acts: unlimited, or `reliableView` of the prey with `reliableSight`
 */
function delayedPlay(hunter, prey, { delays = {}, model }) {
    const seeGap = model.reliableSight ? reliableView(hunter, prey.size) : Infinity;
    return { wait: delays.see ?? 0, runAt: delays.run ?? 0, slowTicks: delays.turn ?? 0, seeGap };
}

/**
 * The start of a chase at an awareness gap. The `perfect` hunter was creeping at its cruise speed and acts the tick the
 * prey is aware; the `reactive` and `naive` hunters were not: they start at rest where they see the prey (or at the
 * awareness gap when that is further), the prey standing still until the gap falls to it, the reactive one acting
 * `reactionTicks` late and sprinting flat out, the naive one holding `naiveEffort` from tick 0.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {number} aware the awareness gap
 * @param {Frame} frame the frame
 * @returns {import('./role-budget-timeline.js').TimelineOptions} the options of `chaseTimeline`
 */
export function frameOptions(hunter, prey, aware, frame) {
    const { tier = 'perfect', bearing = 0, model } = frame;
    const play = preyPlay(frame);
    const hunterPlay = delayedPlay(hunter, prey, frame);
    if (tier === 'perfect') {
        return { gap: aware, bearing, hunterStart: 'cruise', hunter: hunterPlay, prey: play };
    }
    const late = tier === 'reactive' ? model.reactionTicks + hunterPlay.wait : hunterPlay.wait;
    const effort = tier === 'naive' ? model.naiveEffort : 1;
    return {
        gap: Math.max(gapAtSight(hunter, prey, model.reliableSight), aware),
        bearing,
        hunterStart: 'rest',
        hunter: { ...hunterPlay, wait: late, effort },
        prey: { ...play, awareGap: aware },
    };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {number} aware the awareness gap
 * @param {Frame} frame the frame
 * @returns {import('./role-budget-timeline.js').Timeline} the chase at that awareness gap
 */
export function playFrame(hunter, prey, aware, frame) {
    return chaseTimeline(hunter, prey, frameOptions(hunter, prey, aware, frame));
}

/**
 * Bisects between a gap that has `answer` and one that does not, to `GAP_RESOLUTION`.
 * @param {(gap: number) => boolean} kills whether a kill lands from a gap
 * @param {{near: number, far: number, answer: boolean}} span the gap with the answer, the gap without, the answer
 * @returns {number} the last gap that kills: the one with the answer when it is `true`, the other when it is `false`
 */
function refine(kills, { near, far, answer }) {
    let lo = near;
    let hi = far;
    while (Math.abs(hi - lo) > GAP_RESOLUTION) {
        const mid = (lo + hi) / 2;
        if (kills(mid) === answer) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return answer ? lo : hi;
}

/**
 * Walks from a gap at which `kills` has one answer to the nearest gap with the other, in steps of `STEP`, then refines.
 * @param {(gap: number) => boolean} kills whether a kill lands from a gap
 * @param {{from: number, direction: 1 | -1, limit: number}} walk the start, the way and the last gap to look at
 * @returns {number | null} the last gap before the answer flips (the one nearest the start that has the start's answer),
 *   or null when it does not flip before the limit
 */
function boundary(kills, { from, direction, limit }) {
    const answer = kills(from);
    let last = from;
    for (let gap = from + direction * STEP; direction * (limit - gap) >= 0; gap += direction * STEP) {
        if (kills(gap) !== answer) {
            return refine(kills, { near: last, far: gap, answer });
        }
        last = gap;
    }
    return null;
}

/**
 * The reach of a kill around the awareness gap, which is the budget's catch margin once the awareness gap is taken away.
 * A kill is not monotone in the gap (a prey that sprints only when the hunter is close, or has spent its burst, is
 * caught from further), so this walks outward from the gap when a kill lands there, and inward to the nearest gap that
 * kills when it does not.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {Frame} frame the frame
 * @param {number} [aware] the awareness gap to start from (default `gapAtAwareness`)
 * @returns {number} the largest gap, in px, from which a kill lands inside `MAX_TICKS` and the run of kills from the
 *   awareness gap holds (outward), or the nearest killing gap under it (inward); 0 when none kills
 */
export function maxCatchableGap(hunter, prey, frame, aware = gapAtAwareness(hunter, prey)) {
    const kills = (/** @type {number} */ gap) => playFrame(hunter, prey, gap, frame).killTick !== null;
    if (kills(aware)) {
        return boundary(kills, { from: aware, direction: 1, limit: GAP_LIMIT }) ?? GAP_LIMIT;
    }
    return boundary(kills, { from: aware, direction: -1, limit: MIN_GAP }) ?? 0;
}
