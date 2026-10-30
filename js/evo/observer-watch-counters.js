// The observer's chase chains (fitness-and-selection.md, Fitness v6; they feed `style.js` and the chase detectors), per
// slot `chainPrey` and `chainTick`, reset when a slot is reborn into.
//
// - A chain: the ticks a deliberate-bite chain on one prey spans. A chain is a run of the agent's deliberate bites
//   on the same prey (by genome id), each within `packWindow` ticks of the one before. The agent holds the chain from
//   its first bite to its latest one, so each bite that continues a chain gives `noteStyleBite` the ticks since the bite
//   before it. A first bite gives nothing, a gap over `packWindow` or a new prey starts a new chain, and the ticks after
//   the last bite are not counted. Counting at the bite is exact and needs no per-tick scan. A bite is deliberate by
//   the intent tracker's `biteDeliberate`, read for the biter on the tick of the bite.
//
// Nothing here touches the world, and nothing allocates.

import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { biteDeliberate, findAlive } from './observer-intent.js';
import { noteStyleBite } from './style.js';

/**
 * Follows the chain bite a victim took this tick for its biter.
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
    const continues = observer.chainPrey[biter] === prey && gap <= observer.intent.packWindow;
    noteStyleBite(observer.scenes.style, biter, { continues, gap });
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
