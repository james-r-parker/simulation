// The effects a heard call raises (docs/designs/status-effects.md, "The social effects"): `hearOne` (js/sim/calls.js) calls
// `noteHeard` for each hearer that a call reaches. A hunt call a kin hunter hears at or above `hearThreshold` rallies it; an
// alarm that a caller with a threat on its rays gave alerts a non-hunter. A hearer gains a stack once per call, on the tick
// it first hears it: `world.heardFrom` keeps, for each half, the last call that gave the hearer a stack (the caller's slot
// and genome id, and the tick the call began), and a call it already holds is not counted again. The same row tells
// `noteAnswered` (js/sim/effect-social.js) which caller rallied a hunter. Allocates nothing, no RNG.

import { HEARD_FROM_STRIDE } from './agent-arrays.js';
import { EFFECT, SYSTEM } from './effects.js';
import { raiseEffect } from './effect-raise.js';
import { isKin } from './kin.js';

/** Offset of the alarm half of a `heardFrom` row, the same as of a `heard` row. */
export const ALARM_FROM = 0;

/** Offset of the hunt half of a `heardFrom` row. */
export const HUNT_FROM = 3;

/**
 * Notes a call as the last one that gave the hearer a stack, unless the hearer already holds it.
 * @param {any} world the world
 * @param {number} hearer the hearing slot
 * @param {{caller: number, half: number, timers: Uint16Array}} call the caller's slot, the half of the row it is heard in
 *   and that half's call timers
 * @returns {boolean} whether the call is new to the hearer
 */
export function noteCall(world, hearer, call) {
    const { caller } = call;
    // The caller's timer counts down from `callTicks` as the tick counts up, so this is the tick its call began.
    const start = world.tick - world.config.callTicks + call.timers[caller];
    const row = hearer * HEARD_FROM_STRIDE + call.half;
    const from = world.heardFrom;
    const genomeId = world.genomeId[caller];
    if (from[row + 1] === genomeId && from[row + 2] === start) {
        return false;
    }
    from[row] = caller;
    from[row + 1] = genomeId;
    from[row + 2] = start;
    return true;
}

/**
 * Raises the effect a call gives one hearer. Called by `hearOne` for each caller and hearer in range; the call is the one in
 * `world.callScratch` (the caller's slot, then the half it is heard in).
 * @param {any} world the world
 * @param {number} hearer the hearing slot
 * @param {number} loudness the loudness the hearer hears the call at
 * @returns {void}
 */
export function noteHeard(world, hearer, loudness) {
    if (loudness < world.config.hearThreshold) {
        return;
    }
    const caller = world.callScratch[0];
    if (
        world.callScratch[1] === HUNT_FROM &&
        world.huntBySpec[world.spec[hearer]] === 1 &&
        isKin(world, hearer, caller)
    ) {
        if (noteCall(world, hearer, { caller, half: HUNT_FROM, timers: world.huntTimer })) {
            raiseEffect(SYSTEM, world, hearer, { effect: EFFECT.RALLIED, source: caller });
        }
    }
}
