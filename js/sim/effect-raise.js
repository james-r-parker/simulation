// Raising and lowering the stacks of a stored effect (docs/designs/status-effects.md, "Appliers"): the core that
// `applyEffect` (effect-appliers.js) and the fade pass (effects.js, for an effect that hands over to another when it ends)
// share. Each keeps `world.effectLive[row]`, the slots holding a stack of the row, so the fade pass skips an empty row. It takes the effect readers as an argument, so it imports nothing of the registry. Allocates nothing, no RNG.

import { EVENT, EVENT_TYPE, pushEvent } from './events.js';

/** @typedef {import('./effects.js').EffectSystem} EffectSystem */

/**
 * @param {EffectSystem} system the effect readers
 * @param {number} effect an effect's index
 * @returns {number} its stored row, for an effect that keeps stacks
 * @throws {Error} for an effect that stores no stacks
 */
function rowOfStored(system, effect) {
    const row = system.rowOf[effect];
    if (row < 0) {
        throw new Error(`applyEffect: ${system.list[effect].name} stores no stacks, so nothing can raise it`);
    }
    return row;
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {{effect: number, stacks: number, source: number}} gained the effect, the stacks the slot now holds and what
 *   raised it
 * @returns {void}
 */
function pushApplied(world, slot, gained) {
    const at = pushEvent(world.events, EVENT_TYPE.EFFECT_APPLIED, world.tick);
    world.events.data[at + EVENT.EFFECT_APPLIED.SLOT] = slot;
    world.events.data[at + EVENT.EFFECT_APPLIED.EFFECT] = gained.effect;
    world.events.data[at + EVENT.EFFECT_APPLIED.STACKS] = gained.stacks;
    world.events.data[at + EVENT.EFFECT_APPLIED.SOURCE] = gained.source;
}

/**
 * Raises a `stacks` effect by one stack on a slot, up to its `maxStacks`; a stack past the cap is dropped
 * (`EFFECT_CAPPED`). A `ticks` effect restarts its timer (its length times the `by` lane of the body, when it names one);
 * an `every` effect starts its clock only when it had no stack; a `held` effect's applier keeps its own clock. Pushes
 * `EFFECT_APPLIED` for a stack gained.
 * @param {EffectSystem} system the effect readers the world was allocated with
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {{effect: number, source: number}} cause the effect's index and what raised it (an agent slot, or 0)
 * @returns {boolean} whether a stack was gained
 */
export function raiseEffect(system, world, slot, cause) {
    const { effect, source } = cause;
    const row = rowOfStored(system, effect);
    const def = system.list[effect];
    const stacks = world.effectStacks[row];
    if (stacks[slot] >= def.maxStacks) {
        const at = pushEvent(world.events, EVENT_TYPE.EFFECT_CAPPED, world.tick);
        world.events.data[at + EVENT.EFFECT_CAPPED.SLOT] = slot;
        world.events.data[at + EVENT.EFFECT_CAPPED.EFFECT] = effect;
        return false;
    }
    const fades = /** @type {NonNullable<typeof def.fades>} */ (def.fades);
    if (fades.kind === 'ticks' || (fades.kind === 'every' && stacks[slot] === 0)) {
        const length = world.config[fades.key];
        world.effectTicks[row][slot] = fades.by === undefined ? length : length * world.lanes[fades.by][slot];
    }
    if (stacks[slot] === 0) {
        world.effectLive[row] += 1;
    }
    stacks[slot] += 1;
    pushApplied(world, slot, { effect, stacks: stacks[slot], source });
    return true;
}

/**
 * Sets a `held` effect's stacks to a count its applier recounted (the huddle): a rise pushes `EFFECT_APPLIED` for each
 * stack gained, a fall pushes nothing.
 * @param {EffectSystem} system the effect readers
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {{effect: number, count: number, source: number}} to the effect, the new count (capped at `maxStacks`) and the
 *   cause
 * @returns {void}
 */
export function setStacks(system, world, slot, to) {
    const row = rowOfStored(system, to.effect);
    const stacks = world.effectStacks[row];
    const count = Math.min(to.count, system.list[to.effect].maxStacks);
    for (let n = stacks[slot] + 1; n <= count; n++) {
        pushApplied(world, slot, { effect: to.effect, stacks: n, source: to.source });
    }
    world.effectLive[row] += (count > 0 ? 1 : 0) - (stacks[slot] > 0 ? 1 : 0);
    stacks[slot] = count;
}

/**
 * Takes one stack off a stored effect, when the slot holds any; an `every` effect's clock stops with its last stack.
 * @param {EffectSystem} system the effect readers
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect the effect's index
 * @returns {boolean} whether a stack was taken off
 */
export function dropStack(system, world, slot, effect) {
    const row = rowOfStored(system, effect);
    const stacks = world.effectStacks[row];
    if (stacks[slot] < 1) {
        return false;
    }
    stacks[slot] -= 1;
    if (stacks[slot] === 0) {
        world.effectTicks[row][slot] = 0;
        world.effectLive[row] -= 1;
    }
    return true;
}

/**
 * Takes a slot that is being freed out of each stored row's count of slots holding a stack (`world.effectLive`), before
 * `freeAgent` zeroes its rows.
 * @param {any} world the world
 * @param {number} slot the slot being freed
 * @returns {void}
 */
export function releaseStacks(world, slot) {
    const rows = world.effectStacks;
    for (let row = 0; row < rows.length; row++) {
        if (rows[row][slot] > 0) {
            world.effectLive[row] -= 1;
        }
    }
}
