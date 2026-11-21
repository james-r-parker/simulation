// The rules that put an effect on a body, or take its drain (docs/designs/status-effects.md, "Appliers"). An applier is
// called at the site where the cause happens, in the phase it happens in. Allocates nothing, no RNG.

import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { SYSTEM, numberOf } from './effects.js';
import { EVENT, EVENT_TYPE, pushEvent } from './events.js';

/** @typedef {import('./effects.js').EffectSystem} EffectSystem */

/**
 * Raises a `stacks` effect by one stack on a slot, up to its `maxStacks`; a stack past the cap is dropped
 * (`EFFECT_CAPPED`). A `ticks` effect restarts its timer; an `every` effect starts its clock only when it had no stack.
 * Pushes `EFFECT_APPLIED` for a stack gained.
 * @param {EffectSystem} system the effect readers the world was allocated with
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {{effect: number, source: number}} cause the effect's index and what raised it (an agent slot, or 0)
 * @returns {boolean} whether a stack was gained
 */
export function applyEffectOn(system, world, slot, cause) {
    const { effect, source } = cause;
    const row = system.rowOf[effect];
    const def = system.list[effect];
    if (row < 0) {
        throw new Error(`applyEffect: ${def.name} stores no stacks, so nothing can raise it`);
    }
    const stacks = world.effectStacks[row];
    const ticks = world.effectTicks[row];
    if (stacks[slot] >= def.maxStacks) {
        const at = pushEvent(world.events, EVENT_TYPE.EFFECT_CAPPED, world.tick);
        world.events.data[at + EVENT.EFFECT_CAPPED.SLOT] = slot;
        world.events.data[at + EVENT.EFFECT_CAPPED.EFFECT] = effect;
        return false;
    }
    const fades = /** @type {NonNullable<typeof def.fades>} */ (def.fades);
    if (fades.kind === 'ticks' || stacks[slot] === 0) {
        ticks[slot] = world.config[fades.key];
    }
    stacks[slot] += 1;
    const at = pushEvent(world.events, EVENT_TYPE.EFFECT_APPLIED, world.tick);
    world.events.data[at + EVENT.EFFECT_APPLIED.SLOT] = slot;
    world.events.data[at + EVENT.EFFECT_APPLIED.EFFECT] = effect;
    world.events.data[at + EVENT.EFFECT_APPLIED.STACKS] = stacks[slot];
    world.events.data[at + EVENT.EFFECT_APPLIED.SOURCE] = source;
    return true;
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code of a `stacks` effect
 * @param {number} source what raised it
 * @returns {boolean} whether a stack was gained
 */
export function applyEffect(world, slot, effect, source) {
    return applyEffectOn(SYSTEM, world, slot, { effect, source });
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
