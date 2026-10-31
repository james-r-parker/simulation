// The shark rule (natural-selection Phase 4): facultative parthenogenesis. A Komodo dragon or a shark breeds alone
// only when no mate can be found, so an agent may split only after `splitMateScarceTicks`
// ticks without a possible mate in view (600 by default): an agent of its own specialisation, of the other sex and mature, among the
// circles its rays gather this tick. A forager in a crowd of foragers never splits; a lone hunter may. The check reads
// the rows `gatherNear` already wrote, so it costs one pass over them. `mateSeenAt` is
// derived state beside the split-gate counters: zeroed by `freeAgent`, outside `worldHash`, no RNG, no allocation.

import { AGENT, KIND_STRIDE, LOCAL_STRIDE } from './ray-gather.js';

/** @typedef {import('./world.js').World} World */

/** The packed keys of agent rows lie in `[AGENT_KEY, AGENT_KEY + KIND_STRIDE)`. */
const AGENT_KEY = AGENT * KIND_STRIDE;

/**
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @param {number} other an agent in its view
 * @returns {boolean} whether `other` is a possible mate: same specialisation, other sex, mature
 */
function isPossibleMate(world, slot, other) {
    return (
        world.spec[other] === world.spec[slot] &&
        world.sex[other] !== world.sex[slot] &&
        world.ageTicks[other] >= world.config.maturityTicks
    );
}

/**
 * Notes the tick when the caster has a possible mate among the `count` rows `gatherNear` left in `world.rayLocal`.
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @param {number} count the gathered rows
 * @returns {void}
 */
export function noteMatesSeen(world, slot, count) {
    const local = world.rayLocal;
    for (let at = 3, end = count * LOCAL_STRIDE; at < end; at += LOCAL_STRIDE) {
        const other = local[at] - AGENT_KEY;
        if (other >= 0 && other < KIND_STRIDE && isPossibleMate(world, slot, other)) {
            world.mateSeenAt[slot] = world.tick;
            return;
        }
    }
}

/**
 * Starts a newborn's wait at its birth tick, so it cannot split before it has looked for a mate.
 * @param {World} world the world
 * @param {number} child the newborn
 * @returns {void}
 */
export function noteMateScarcityBirth(world, child) {
    world.mateSeenAt[child] = world.tick;
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when the agent has seen no possible mate for `splitMateScarceTicks` (always at 0)
 */
export function mateScarce(world, slot) {
    return world.tick - world.mateSeenAt[slot] >= world.config.splitMateScarceTicks;
}
