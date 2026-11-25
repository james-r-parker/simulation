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
 * The perfect hunter's sprint-effort sweep, in two passes: `EFFORTS` (0 to 1 in steps of 0.05), then `FINE_EFFORT` steps of
 * 0.01 for `FINE_SPAN` either side of the best of the first. The reach is not smooth in the effort: the break and the burst
 * running out flip on a tick, so a row's reach steps by up to 60 px between neighbouring efforts (E-RB-1: `long` forager
 * 231 px at 0.70, 289 at 0.74) and a pass of 0.05 alone under-reads it. Against a pass of 0.0025 over the same rows
 * (`long` and `even` on the broken bound) the two passes read within 7 px, and the grid of 0.05 holds `naiveEffort` (0.5)
 * and the oracle's effort 1, so the best is never under either. The resolution of the brain's own sprint output is finer
 * than any of these (a float), so the sweep is a bound to this resolution, not exact.
 */
export const EFFORT_STEP = 0.05;
export const FINE_EFFORT = 0.01;
const FINE_SPAN = 4 * FINE_EFFORT;
/** The efforts of the first pass, from 1 down to 0 (no sprint), so that a tie goes to the higher effort. */
export const EFFORTS = Object.freeze(
    Array.from({ length: Math.round(1 / EFFORT_STEP) + 1 }, (_, i) => 1 - i * EFFORT_STEP),
);

/**
 * @typedef {'perfect' | 'reactive' | 'naive'} Tier
 * @typedef {'straight' | 'broken'} Bound
 * @typedef {object} Frame what a chase is played as
 * @property {Tier} [tier] the performer (default `perfect`)
 * @property {'always' | 'view'} [sprint] when the `perfect` hunter sprints (default `always`, from tick 0 to an empty store; `view`
 *   is the oracle's: only with the prey in view and the store above its floor)
 * @property {number} [effort] the `perfect` hunter's sprint effort; unset, `maxCatchableGap` sweeps `EFFORTS` and reads the best
 * @property {boolean} [fine] whether the sweep adds its second pass of `FINE_EFFORT` steps (default true); the eight audit
 *   bearings read the first pass only, a diagnostic that costs a third of the headline's time
 * @property {Bound} [bound] the prey's play (default `broken`)
 * @property {number} [bearing] the angle of the line to the prey from the hunter's heading (default 0)
 * @property {{speed: number, offset: number}} [preyStart] the prey's speed at tick 0 and its heading's offset from straight away
 *   from the hunter, in radians (default at rest and facing away); a warned forager that has turned is moving, not standing
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
    const { tier = 'perfect', bearing = 0, model, preyStart } = frame;
    const play = preyPlay(frame);
    const hunterPlay = delayedPlay(hunter, prey, frame);
    if (tier === 'perfect') {
        const performer = {
            ...hunterPlay,
            effort: frame.effort ?? 1,
            ...(frame.sprint === undefined ? {} : { sprint: frame.sprint }),
        };
        return { gap: aware, bearing, hunterStart: 'cruise', hunter: performer, prey: play, preyStart };
    }
    const late = tier === 'reactive' ? model.reactionTicks + hunterPlay.wait : hunterPlay.wait;
    const effort = tier === 'naive' ? model.naiveEffort : 1;
    return {
        gap: Math.max(gapAtSight(hunter, prey, model.reliableSight), aware),
        bearing,
        hunterStart: 'rest',
        hunter: { ...hunterPlay, wait: late, effort },
        prey: { ...play, awareGap: aware },
        preyStart,
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
 * @param {number} fallback what to return when the answer does not flip before the limit
 * @returns {number} the last gap before the answer flips (the one nearest the start that has the start's answer)
 */
function boundary(kills, { from, direction, limit }, fallback) {
    const answer = kills(from);
    let last = from;
    for (let gap = from + direction * STEP; direction * (limit - gap) >= 0; gap += direction * STEP) {
        if (kills(gap) !== answer) {
            return refine(kills, { near: last, far: gap, answer });
        }
        last = gap;
    }
    return fallback;
}

/**
 * The reach of a kill around the awareness gap, which is the budget's catch margin once the awareness gap is taken away.
 * A kill is not monotone in the gap (a prey that sprints only when the hunter is close, or has spent its burst, is
 * caught from further), so this walks outward from the gap when a kill lands there, and inward to the nearest gap that
 * kills when it does not.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {Frame} frame the frame
 * @param {{aware: number, beat?: number}} at the awareness gap to start from, and a reach to beat: a frame that cannot
 *   exceed it is not walked to the end and reads -Infinity (the sweep of `bestEffort` only needs the best, and a frame
 *   that does not kill at `beat` or at `aware` cannot beat it)
 * @returns {number} the largest gap, in px, from which a kill lands inside `MAX_TICKS` and the run of kills from the
 *   awareness gap holds (outward), or the nearest killing gap under it (inward); 0 when none kills
 */
function reachAt(hunter, prey, frame, { aware, beat = -Infinity }) {
    /** @type {Map<number, boolean>} */
    const seen = new Map();
    const kills = (/** @type {number} */ gap) => {
        if (!seen.has(gap)) {
            seen.set(gap, playFrame(hunter, prey, gap, frame).killTick !== null);
        }
        return /** @type {boolean} */ (seen.get(gap));
    };
    if (kills(aware)) {
        if (beat > aware && !kills(beat)) {
            return -Infinity;
        }
        return boundary(kills, { from: aware, direction: 1, limit: GAP_LIMIT }, GAP_LIMIT);
    }
    if (beat >= aware) {
        return -Infinity;
    }
    return boundary(kills, { from: aware, direction: -1, limit: Math.max(MIN_GAP, beat) }, 0);
}

/** The sweeps read so far, by hunter and prey: the matrix reads a pair's bearing 0 on the broken bound three times. */
const SWEEPS = new WeakMap();

/**
 * @param {Frame} frame the frame
 * @param {number} aware the awareness gap
 * @returns {string} what a sweep depends on besides the pair
 */
function sweepKey(
    { bound = 'broken', bearing = 0, model, delays = {}, fine = true, preyStart, sprint = 'always' },
    aware,
) {
    return JSON.stringify([bound, bearing, aware, model, delays, fine, preyStart, sprint]);
}

/**
 * The `perfect` hunter's best play: the sprint effort of `EFFORTS` that reaches furthest, so the tier is an upper bound on
 * "whether the job is possible at all" (a hunter sprinting flat out overshoots the evader's break, and one at half effort
 * can still hold it). A tie goes to the higher effort, so a row the oracle's effort 1 already wins reads as before.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {Frame} frame the frame; its `effort` is ignored
 * @param {number} [aware] the awareness gap to start from (default `gapAtAwareness`)
 * @returns {{effort: number, gap: number}} the best effort and the reach it gives
 */
export function bestEffort(hunter, prey, frame, aware = gapAtAwareness(hunter, prey)) {
    const byPrey = SWEEPS.get(hunter) ?? new WeakMap();
    const seen = byPrey.get(prey) ?? { reads: new Map(), hint: 1 };
    SWEEPS.set(hunter, byPrey);
    byPrey.set(prey, seen);
    const key = sweepKey(frame, aware);
    if (!seen.reads.has(key)) {
        seen.reads.set(key, sweep(hunter, prey, frame, { aware, hint: seen.hint }));
    }
    const read = seen.reads.get(key);
    seen.hint = read.effort;
    return read;
}

/**
 * The two passes over the efforts, the effort that did best on the pair's last read first: a frame the best effort already beats is
 * dropped after two chases (`reachAt` with `beat`), so the order changes the cost and never the answer, ties included.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {Frame} frame the frame
 * @param {{aware: number, hint: number}} start the awareness gap to start from, and the effort to try first
 * @returns {{effort: number, gap: number}} the best effort and the reach it gives
 */
function sweep(hunter, prey, frame, { aware, hint }) {
    let best = { effort: hint, gap: -Infinity };
    const read = (/** @type {number[]} */ efforts) => {
        for (const effort of efforts) {
            const gap = reachAt(hunter, prey, { ...frame, effort }, { aware, beat: best.gap });
            if (gap > best.gap || (gap === best.gap && effort > best.effort)) {
                best = { effort, gap };
            }
        }
    };
    read([hint, ...EFFORTS.filter((e) => e !== hint)]);
    if (frame.fine === false) {
        return best;
    }
    const coarse = best.effort;
    const steps = Math.round(FINE_SPAN / FINE_EFFORT);
    read(
        Array.from(
            { length: 2 * steps + 1 },
            (_, i) => Math.round((coarse + (steps - i) * FINE_EFFORT) * 1e6) / 1e6,
        ).filter((e) => e >= 0 && e <= 1 && e !== coarse && !EFFORTS.some((c) => Math.abs(c - e) < 1e-9)),
    );
    return best;
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {Frame} frame the frame; a `perfect` frame without an `effort` reads the best of `EFFORTS` (`bestEffort`)
 * @param {number} [aware] the awareness gap to start from (default `gapAtAwareness`)
 * @returns {number} the reach of a kill (`reachAt`) of the frame's performer
 */
export function maxCatchableGap(hunter, prey, frame, aware = gapAtAwareness(hunter, prey)) {
    if ((frame.tier ?? 'perfect') === 'perfect' && frame.effort === undefined) {
        return bestEffort(hunter, prey, frame, aware).gap;
    }
    return reachAt(hunter, prey, frame, { aware });
}
