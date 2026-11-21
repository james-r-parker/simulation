// When a chase that does not kill ends (docs/designs/role-budget.md, "A hunter's living"): the sim's give-up rule, read from
// `js/sim/merit-state.js` and the approach scene of the observer (`scene-approach.js`). A chase is open on a tick when the prey
// was sighted within `INTENT_WINDOW` ticks and the hunter shows `CLOSING_MIN` closing ticks of its last `CLOSING_BITS` (a
// closing tick is a speed towards the prey above `CLOSING_SPEED x maxVelocity`); it lapses, as a give-up, on the first tick that
// is more than `INTENT_WINDOW` after the last open one (lost: the prey left the rays; quit: it stopped closing). The brain decides nothing here: the reactive
// tier's hunter, like the scripted pursuer, never stops by itself, so the end is the observer's lapse. Pure.

import { CLOSING_BITS, CLOSING_MIN, CLOSING_SPEED, INTENT_WINDOW } from '../sim/merit-state.js';
import { norm } from './role-budget-kinematics.js';

const MASK = (1 << CLOSING_BITS) - 1;

/**
 * @typedef {object} Lapse
 * @property {number} bits the closing history, one bit a tick, newest lowest
 * @property {number} seen the last tick the prey was on the rays (-1000 for never)
 * @property {number} opened the tick the chase opened (-1 for not yet)
 * @property {number} lastOpen the last tick the chase was open
 * @property {number} ended the ticks the chase lasted: the tick count at its first lapse after it opened (0 while it has not)
 */

/** @returns {Lapse} an empty tracker */
export function createLapse() {
    return { bits: 0, seen: -1000, opened: -1, lastOpen: -1, ended: 0 };
}

/** @param {number} n @returns {number} the set bits of n */
function popcount(n) {
    let c = 0;
    for (let v = n; v !== 0; v &= v - 1) {
        c++;
    }
    return c;
}

/**
 * Notes one tick of a chase.
 * @param {Lapse} lapse the tracker, updated in place
 * @param {{h: {x: number, y: number, vx: number, vy: number}, p: {x: number, y: number}, tick: number, maxVelocity: number,
 *   sight: number}} at the hunter and the prey after the tick's step, the tick (from 0), the hunter's `maxVelocity` and the
 *   centre gap inside which the prey is on its rays
 * @returns {void}
 */
export function noteLapse(lapse, { h, p, tick, maxVelocity, sight }) {
    if (lapse.ended > 0) {
        return;
    }
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const gap = norm(dx, dy);
    const toward = (h.vx * dx + h.vy * dy) / Math.max(gap, 1e-9);
    lapse.bits = ((lapse.bits << 1) | (toward > CLOSING_SPEED * maxVelocity ? 1 : 0)) & MASK;
    lapse.seen = gap <= sight ? tick : lapse.seen;
    const open = tick - lapse.seen <= INTENT_WINDOW && popcount(lapse.bits) >= CLOSING_MIN;
    if (open) {
        lapse.opened = lapse.opened < 0 ? tick : lapse.opened;
        lapse.lastOpen = tick;
    } else if (lapse.opened >= 0 && tick - lapse.lastOpen > INTENT_WINDOW) {
        lapse.ended = tick + 1;
    }
}

/**
 * @param {Lapse} lapse the tracker at the end of a run
 * @param {number} maxTicks the run's length
 * @returns {number} the ticks a chase that does not kill lasts: to its first lapse, `maxTicks` when it never lapsed, 0 when it never
 *   opened (a hunter that never closed on a sighted prey)
 */
export function lapseTicks(lapse, maxTicks) {
    if (lapse.opened < 0) {
        return 0;
    }
    return lapse.ended > 0 ? lapse.ended : maxTicks;
}
