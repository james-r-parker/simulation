// The appliers of the social effects that a call site raises (docs/designs/status-effects.md, "The social effects"): each
// is called where its cause happens, in the phase it happens in, and puts a stack on a body with `raiseEffect`. They
// allocate nothing and draw no RNG. No effect pays a body for an act: each is raised on the body that suffers or hears it,
// or on a caller whose call a pack-mate answered with a kill it shared.

import { HEARD_FROM_STRIDE } from './agent-arrays.js';
import { EVENT, EVENT_TYPE, pushEvent } from './events.js';
import { HUNT_FROM } from './effect-hear.js';
import { dropStack, raiseEffect } from './effect-raise.js';
import { EFFECT, SYSTEM } from './effects.js';

/**
 * A body that a bite leaves alive is `wounded` and `panicked`, one stack of each a bite (`applyBite`, js/sim/feeding.js).
 * @param {any} world the world
 * @param {number} victim the bitten slot, still alive
 * @param {number} biter the biting slot
 * @returns {void}
 */
export function noteBitten(world, victim, biter) {
    raiseEffect(SYSTEM, world, victim, { effect: EFFECT.WOUNDED, source: biter });
    raiseEffect(SYSTEM, world, victim, { effect: EFFECT.PANICKED, source: biter });
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
 * A call is paid for with a `hoarse` stack, one a call; an alarm fired with a threat on the caller's rays takes one off at
 * once, so a call that warns of something real stays cheap (`alarm` and `huntCall`, js/sim/calls.js).
 * @param {any} world the world
 * @param {number} caller the calling slot
 * @param {boolean} honest whether the call warns of a real threat
 * @returns {void}
 */
export function noteCalled(world, caller, honest) {
    raiseEffect(SYSTEM, world, caller, { effect: EFFECT.HOARSE, source: caller });
    if (honest) {
        dropStack(SYSTEM, world, caller, EFFECT.HOARSE);
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
        raiseEffect(SYSTEM, world, caller, { effect: EFFECT.ANSWERED, source: biter });
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
        raiseEffect(SYSTEM, world, target, { effect: EFFECT.STAGGERED, source: defender });
    }
}
