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
// - `packKills`: for a convergent pack kill (both of the last two bites deliberate, by two agents of one lineage), the
//   other kin within `callRadius` of where the victim fell. The killer and the previous biter are paid by the skill
//   group's `convergedKills` credit, so the watch term pays the pack that stood around them and a converged kill is
//   not paid twice. Kin are alive agents of the killer's lineage; a newborn whose slot the observer has not yet
//   reset is skipped. Counted at the kill, in a scan of the slots that only a convergent kill pays for.
// - `patchesVisited`: the distinct food patches the agent was strictly inside at a 100-tick sample, which is the
//   bitset `sampleVisits` (`watch-visits.js`) already keeps for `eval.migration_index`; read through
//   `patchesVisitedOf` so the fitness and the metric share one count.
//
// Nothing here touches the world, and nothing allocates.

import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { biteDeliberate, findAlive } from './observer-intent.js';
import { noteStyleBite } from './style.js';

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
    const continues = observer.chainPrey[biter] === prey && gap <= observer.intent.packWindow;
    if (continues) {
        observer.chaseTicks[biter] += gap;
    }
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

/**
 * @param {Record<string, any>} observer the observer
 * @param {number} slot a tracked slot, alive or just dead
 * @returns {number} the distinct food patches the slot's agent visited
 */
export function patchesVisitedOf(observer, slot) {
    return observer.watch.visited[slot];
}

/**
 * Credits a convergent pack kill to the kin around it. Run for the eaten death at slot `victim`, which still holds its
 * position, with the killer's and the previous biter's genome ids.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {{victim: number, killerId: number, previousId: number}} kill the victim's slot and the two biters' genome ids
 * @returns {void}
 */
export function notePackKin(observer, world, { victim, killerId, previousId }) {
    const killer = findAlive(world, observer.slotOf, killerId);
    if (killer < 0) {
        return;
    }
    const { alive, genomeId, lineageId, x, y } = world;
    const r2 = observer.intent.callRadius * observer.intent.callRadius;
    for (let s = 0; s < alive.length; s++) {
        const dx = x[s] - x[victim];
        const dy = y[s] - y[victim];
        const kin = alive[s] === 1 && lineageId[s] === lineageId[killer] && dx * dx + dy * dy <= r2;
        if (kin && s !== killer && genomeId[s] !== previousId && observer.genomeId[s] === genomeId[s]) {
            observer.packKills[s] += 1;
        }
    }
}
