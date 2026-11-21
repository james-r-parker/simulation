// The rules that put an effect on a body, or take its drain (docs/designs/status-effects.md, "Appliers"). An applier is
// called at the site where the cause happens, in the phase it happens in. Allocates nothing, no RNG.

import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { SYSTEM, numberOf, raiseOn } from './effects.js';
import { dropStack, raiseEffect, setStacks } from './effect-raise.js';

/** @typedef {import('./effects.js').EffectSystem} EffectSystem */

/** `raiseEffect` of effect-raise.js under the name this module has always had, for a caller that holds its own system. */
export const applyEffectOn = raiseEffect;

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code of a `stacks` effect
 * @param {number} source what raised it
 * @returns {boolean} whether a stack was gained
 */
export function applyEffect(world, slot, effect, source) {
    return raiseOn(world, slot, effect, source);
}

/**
 * Removes the energy an effect drains for one tick from a slot: each drain's `perTick` times the effect's level (times the
 * named per-slot array, `dose`), booked under its loss cause. Called where the rule drained before, so the order of the
 * tick is the one it was.
 * @param {EffectSystem} system the effect readers
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect the effect's index
 * @returns {void}
 */
export function drainEffectOn(system, world, slot, effect) {
    const level = system.levelOf(world, slot, effect);
    if (!(level > 0)) {
        return;
    }
    const { drains } = system.list[effect];
    for (let k = 0; k < drains.length; k++) {
        const drain = drains[k];
        const per = numberOf(world, slot, system.drainRefs[effect][k]);
        const times = drain.times === undefined ? 1 : world[drain.times][slot];
        removeEnergy(world, slot, per * level * times, /** @type {Record<string, number>} */ (LOSS_CAUSE)[drain.cause]);
    }
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code
 * @returns {void}
 */
export function drainEffect(world, slot, effect) {
    drainEffectOn(SYSTEM, world, slot, effect);
}

/**
 * Takes one stack off a stored effect (an `answered` kill or a seen alarm takes one off `hoarse`).
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code of a `stacks` effect
 * @returns {boolean} whether a stack was taken off
 */
export function dropEffect(world, slot, effect) {
    return dropStack(SYSTEM, world, slot, effect);
}

/**
 * Sets a `held` effect's stacks to a recounted number (the huddle), capped at `maxStacks`.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {{effect: number, count: number, source: number}} to an `EFFECT` code of a `held` effect, the new count and
 *   the cause
 * @returns {void}
 */
export function setEffectStacks(world, slot, to) {
    setStacks(SYSTEM, world, slot, to);
}
