// Generation depth per slot: how many mate or split births separate an agent from the initial population.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';

/**
 * @typedef {object} Generations
 * @property {Uint16Array} depth the generation of the agent in each slot
 * @property {Uint16Array} pending the tick's newborn depths, written after all are computed
 */

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`, `eventCapacity`)
 * @returns {Generations} every slot at generation 0
 */
export function createGenerations(config) {
    return { depth: new Uint16Array(config.maxAgents), pending: new Uint16Array(config.eventCapacity) };
}

/**
 * @param {Generations} generations the depths
 * @param {Map<number, number>} slotOf genome id to slot
 * @param {number} genomeId a parent
 * @returns {number} the parent's depth, 0 when it is not in `slotOf`
 */
function parentDepth(generations, slotOf, genomeId) {
    const slot = slotOf.get(genomeId);
    return slot === undefined ? 0 : generations.depth[slot];
}

/**
 * Sets the depth of every slot born this tick. A `mate` or `split` child is one deeper than its deeper parent, read
 * before the tick's deaths are applied; every other birth is depth 0. All depths are computed before any is written,
 * so a parent whose slot a newborn takes is still read at its own depth. Call it after `step` and before the observer
 * applies the tick, so `slotOf` still holds the parents.
 * @param {Generations} generations the depths
 * @param {Record<string, any>} world the world just stepped
 * @param {Map<number, number>} slotOf the observer's genome id to slot map, from before this tick's events
 * @returns {void}
 */
export function noteBirths(generations, world, slotOf) {
    const d = world.events.data;
    const { count } = world.events;
    const { pending } = generations;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] === EVENT_TYPE.AGENT_BORN) {
            const cause = d[o + 8];
            const inherits = cause === BORN_CAUSE.MATE || cause === BORN_CAUSE.SPLIT;
            const a = parentDepth(generations, slotOf, d[o + 6]);
            const b = parentDepth(generations, slotOf, d[o + 7]);
            pending[i] = inherits ? Math.max(a, b) + 1 : 0;
        }
    }
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] === EVENT_TYPE.AGENT_BORN) {
            generations.depth[d[o + 2]] = pending[i];
        }
    }
}

/**
 * @param {Generations} generations the depths
 * @param {number} slot an alive slot
 * @returns {number} its generation
 */
export function generationOf(generations, slot) {
    return generations.depth[slot];
}
