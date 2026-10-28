// The observer's watch counters (fitness-and-selection.md, Fitness v6): per slot `chaseTicks` and `patchesVisited`,
// both reset when a slot is reborn into and both still readable in `finishDeath`, because the observer keeps its own
// slot arrays after the sim frees the slot.
//
// - `chaseTicks`: the ticks a deliberate-bite chain on one prey spans. A chain is a run of the agent's deliberate bites
//   on the same prey (by genome id), each within `packWindow` ticks of the one before. The agent holds the chain from
//   its first bite to its latest one, so each bite that continues a chain credits the ticks since the bite before it.
//   A first bite credits nothing, a gap over `packWindow` or a new prey starts a new chain, and the ticks after the
//   last bite are not credited. Counting at the bite is exact and needs no per-tick scan. A bite is deliberate by
//   the intent tracker's `biteDeliberate`, read for the biter on the tick of the bite.
// - `patchesVisited`: the distinct food patches the agent was strictly inside at a 100-tick sample, which is the
//   bitset `sampleVisits` (`watch-visits.js`) already keeps for `eval.migration_index`; read through
//   `patchesVisitedOf` so the fitness and the metric share one count.
//
// Nothing here touches the world, and nothing allocates.

import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { biteDeliberate, findAlive } from './observer-intent.js';

/**
 * Credits the chain bite a victim took this tick to its biter.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} victim an alive slot bitten this tick
 * @returns {void}
 */
function creditBite(observer, world, victim) {
    const biter = findAlive(world, observer.slotOf, world.lastBiter[victim]);
    if (biter < 0 || !biteDeliberate(observer.intent, biter, world.tick)) {
        return;
    }
    const prey = world.genomeId[victim];
    const gap = world.tick - observer.chainTick[biter];
    if (observer.chainPrey[biter] === prey && gap <= observer.intent.packWindow) {
        observer.chaseTicks[biter] += gap;
    }
    observer.chainPrey[biter] = prey;
    observer.chainTick[biter] = world.tick;
}

/**
 * Credits the deliberate-bite chains of the tick's landed bites. Run after `updateIntent`, whose sightings decide
 * whether a bite is deliberate. A bite that kills its victim is not seen (the victim is no longer alive), as in the
 * intent tracker's own bite records.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteChase(observer, world) {
    const { alive, bittenTimer } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && bittenTimer[slot] === BITTEN_THIS_TICK) {
            creditBite(observer, world, slot);
        }
    }
}

/**
 * @param {Record<string, any>} observer the observer
 * @param {number} slot a tracked slot, alive or just dead
 * @returns {number} the distinct food patches the slot's agent visited
 */
export function patchesVisitedOf(observer, slot) {
    return observer.watch.visited[slot];
}
