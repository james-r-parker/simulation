// The effects a heard call raises (docs/designs/status-effects.md, "The social effects"): `hearOne` (js/sim/calls.js) calls
// `noteHeard` for each hearer that a call reaches. A hunt call a kin hunter hears at or above `hearThreshold` rallies it; an
// alarm that a caller with a threat on its rays gave alerts a non-hunter. A hearer gains a stack once per call, on the tick
// the call starts: `world.heardFrom` keeps, for each half, the last call that gave the hearer a stack (the caller's slot
// and genome id, and the tick the call began), and a call it already holds is not counted again. The same row tells
// `noteAnswered` (js/sim/effect-social.js) which caller rallied a hunter. Allocates nothing, no RNG.

import { HEARD_FROM_STRIDE } from './agent-arrays.js';
import { EFFECT, raiseOn } from './effects.js';
import { callEffectsOn } from './effect-numbers.js';
import { isKin } from './kin.js';

/** Offset of the alarm half of a `heardFrom` row, the same as of a `heard` row. */
export const ALARM_FROM = 0;

/** Offset of the hunt half of a `heardFrom` row. */
export const HUNT_FROM = 3;

/**
 * Notes a call as the last one that gave the hearer a stack, on the tick the call starts only: a call is counted once, not
 * once a tick, however many live calls the hearer is in range of (`heardFrom` keeps just the last call, so comparing it
 * against a call that is still running would see a new one every tick), and once however many hash cells the hearer's body
 * covers (a repeat of the call this tick is not counted). A hearer that comes into range later hears the call
 * but gains no stack from it.
 * @param {any} world the world
 * @param {number} hearer the hearing slot
 * @param {number} caller the calling slot
 * @param {number} half `ALARM_FROM` or `HUNT_FROM`: the half of the row the call is heard in
 * @returns {boolean} whether the call starts this tick
 */
function noteCall(world, hearer, caller, half) {
    const timers = half === HUNT_FROM ? world.huntTimer : world.alarmTimer;
    if (timers[caller] !== world.lanes.callTicks[caller]) {
        return false;
    }
    const row = hearer * HEARD_FROM_STRIDE + half;
    if (world.heardFrom[row + 2] === world.tick && world.heardFrom[row + 1] === world.genomeId[caller]) {
        return false; // the hash lists a body in each cell its box covers, so the same call reaches it once per cell
    }
    world.heardFrom[row] = caller;
    world.heardFrom[row + 1] = world.genomeId[caller];
    world.heardFrom[row + 2] = world.tick;
    world.callHeard[caller * 2 + (half === HUNT_FROM ? 1 : 0)] = 1;
    return true;
}

/**
 * A hunt call heard by a hunter that is kin of the caller gives it one `rallied` stack, once per call.
 * @param {any} world the world
 * @param {number} hearer the hearing slot
 * @param {number} caller the calling slot
 * @returns {void}
 */
function rally(world, hearer, caller) {
    if (world.huntBySpec[world.spec[hearer]] === 1 && isKin(world, hearer, caller)) {
        if (noteCall(world, hearer, caller, HUNT_FROM)) {
            raiseOn(world, hearer, EFFECT.RALLIED, caller);
        }
    }
}

/**
 * An alarm that a caller with a threat on its rays gave (`alarmSeen`) gives a non-hunter one `alert` stack, once per call.
 * An alarm with nothing in view gives none, so calling among kin for the boost does nothing.
 * @param {any} world the world
 * @param {number} hearer the hearing slot
 * @param {number} caller the calling slot
 * @returns {void}
 */
function alert(world, hearer, caller) {
    if (world.alarmSeen[caller] === 1 && world.huntBySpec[world.spec[hearer]] !== 1) {
        if (noteCall(world, hearer, caller, ALARM_FROM)) {
            raiseOn(world, hearer, EFFECT.ALERT, caller);
        }
    }
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
    const { callScratch } = world;
    if (callScratch[1] === HUNT_FROM) {
        if (callEffectsOn(world.config)) {
            rally(world, hearer, callScratch[0]);
        }
    } else {
        alert(world, hearer, callScratch[0]);
    }
}
