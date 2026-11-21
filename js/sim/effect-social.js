// The appliers of the social effects that a call site raises (docs/designs/status-effects.md, "The social effects"): each
// is called where its cause happens, in the phase it happens in, and puts a stack on a body with `raiseEffect`. They
// allocate nothing and draw no RNG. No effect pays a body for an act: each is raised on the body that suffers or hears it,
// or on a caller whose call a pack-mate answered with a kill it shared.

import { HEARD_FROM_STRIDE } from './agent-arrays.js';
import { EVENT, EVENT_TYPE, pushEvent } from './events.js';
import { HUNT_FROM } from './effect-hear.js';
import { dropStack } from './effect-raise.js';
import { EFFECT, SYSTEM, raiseOn } from './effects.js';

/**
 * A body that a bite leaves alive is `wounded` and `panicked`, one stack of each a bite (`applyBite`, js/sim/feeding.js).
 * @param {any} world the world
 * @param {number} victim the bitten slot, still alive
 * @param {number} biter the biting slot
 * @returns {void}
 */
export function noteBitten(world, victim, biter) {
    raiseOn(world, victim, EFFECT.WOUNDED, biter);
    raiseOn(world, victim, EFFECT.PANICKED, biter);
}

/**
 * What a bite does to the effects of its two bodies, once it is booked: a kill may answer the caller of the hunter that made
 * it, and a bite the victim lives through wounds and panics it (`applyBite`, js/sim/feeding.js).
 * @param {any} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @param {boolean} fatal whether the bite killed
 * @returns {void}
 */
export function noteBiteEffects(world, biter, victim, fatal) {
    if (fatal) {
        noteAnswered(world, biter, victim);
    } else if (world.energy[victim] > 0) {
        noteBitten(world, victim, biter);
    }
}

/**
 * Prices the calls made this tick, after the hearing passes (`signalAll`, js/sim/calls.js). A wasted call earns the caller a
 * `hoarse` stack, and each stack multiplies the cost of its next call: an alarm that nobody heard, one raised with no threat
 * in the caller's view, or a hunt call no kin hunter answered. A call that was heard and had a reason adds none, and an
 * alarm that warned of a real threat takes one stack off, so a rare false alarm stays cheap and spam burns out.
 * @param {any} world the world
 * @param {number} caller the calling slot, whose alarm or hunt timer was set this tick
 * @returns {void}
 */
function settleCaller(world, caller) {
    const callTicks = world.lanes.callTicks[caller];
    if (world.alarmTimer[caller] === callTicks) {
        if (world.alarmSeen[caller] === 0 || world.callHeard[caller * 2] === 0) {
            raiseOn(world, caller, EFFECT.HOARSE, caller);
        } else {
            dropStack(SYSTEM, world, caller, EFFECT.HOARSE);
        }
    }
    if (world.huntTimer[caller] === callTicks && world.callHeard[caller * 2 + 1] === 0) {
        raiseOn(world, caller, EFFECT.HOARSE, caller);
    }
}

/**
 * Settles every call made this tick (`settleCaller`).
 * @param {any} world the world
 * @returns {void}
 */
export function settleCalls(world) {
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            settleCaller(world, slot);
        }
    }
}

/**
 * @param {any} world the world
 * @param {number} biter the rallied hunter that made a kill
 * @returns {number} the slot of the caller that rallied it, -1 when it is not rallied or the caller is gone
 */
function rallier(world, biter) {
    const row = biter * HEARD_FROM_STRIDE + HUNT_FROM;
    const callerId = world.heardFrom[row + 1];
    const caller = world.heardFrom[row];
    const rallied = world.effectStacks[SYSTEM.rowOf[EFFECT.RALLIED]][biter];
    if (callerId === 0 || rallied === 0 || world.alive[caller] !== 1 || world.genomeId[caller] !== callerId) {
        return -1;
    }
    return caller;
}

/**
 * A kill by a rallied hunter answers the caller that rallied it, when the caller also bit the prey within `rallyTicks`: the
 * caller gains an `answered` stack and a `hoarse` stack comes off. Standing by earns nothing, and neither does a call that
 * nobody closed on (`applyBite`, js/sim/feeding.js, after the fatal bite is booked: the victim's `prevBiter` is then the last
 * biter before the killer).
 * @param {any} world the world
 * @param {number} biter the killing slot
 * @param {number} victim the killed slot
 * @returns {void}
 */
export function noteAnswered(world, biter, victim) {
    const caller = rallier(world, biter);
    if (caller < 0) {
        return;
    }
    const bit = world.prevBiter[victim] === world.genomeId[caller];
    if (bit && world.tick - world.prevBiteTick[victim] <= world.config.rallyTicks) {
        raiseOn(world, caller, EFFECT.ANSWERED, biter);
        dropStack(SYSTEM, world, caller, EFFECT.HOARSE);
    }
}

/**
 * A hunter that a defender shoves (`tryDefenderRepel`, js/sim/defender-repel.js) is `staggered`: slower, and unable to bite
 * while it lasts. The shove is logged as `DefenderShoved`. With `staggerThrust` at 0 no stack is raised, since the stack
 * closes the `bite` gate whatever the numbers say.
 * @param {any} world the world
 * @param {number} defender the shoving slot
 * @param {number} target the hunter it shoved
 * @returns {void}
 */
export function noteShoved(world, defender, target) {
    const at = pushEvent(world.events, EVENT_TYPE.DEFENDER_SHOVED, world.tick);
    world.events.data[at + EVENT.DEFENDER_SHOVED.SLOT] = defender;
    world.events.data[at + EVENT.DEFENDER_SHOVED.TARGET] = target;
    if (world.config.staggerThrust > 0) {
        raiseOn(world, target, EFFECT.STAGGERED, defender);
    }
}
