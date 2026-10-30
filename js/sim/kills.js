// Deliberate kills (natural-selection.md T8): the sim counter `deliberateKills` beside `mealsDeliberate`, the mate rank of a
// hunting specialisation. The eval observer's `intent.deliberateKills` (js/evo/observer-intent-events.js) is the reference,
// and `test/evo/kills.agreement.slow.test.js` compares the two on a replay, so this ports its rule exactly:
//
// - Each tick the merit phase notes, for a victim bitten that tick, whether the biter's bite was deliberate
//   (`lastBiteDeliberate`, the biter's prey tracker at the tick, as `noteBite`).
// - When an agent is eaten, `noteKill` logs its killer's genome id if the victim's last noted bite was deliberate. The fatal
//   bite itself is not noted, as the victim is freed before the merit phase: the record is the bite before it.
// - At the end of the merit phase `creditKills` credits each logged killer that is still alive (a killer that died in the
//   same tick earns nothing, as in the observer).
//
// Per-slot arrays zeroed by `freeAgent`, outside `worldHash`, and a preallocated log: no allocation per tick.

import { biteDeliberate, slotOfGenome } from './merit-state.js';

/**
 * @returns {[Uint8ArrayConstructor | Uint32ArrayConstructor, string, number][]} the allocation specs for `allocateWorld`,
 *   one element per slot: `deliberateKills` and `lastBiteDeliberate`
 */
export function killSpecs() {
    return [
        [Uint32Array, 'deliberateKills', 1],
        [Uint8Array, 'lastBiteDeliberate', 1],
    ];
}

/**
 * Notes a bite on an alive victim this tick: whether the biter's bite was deliberate.
 * @param {Record<string, any>} world the world, after the merit trackers ran this tick
 * @param {number} victim the bitten slot
 * @returns {void}
 */
export function noteBite(world, victim) {
    const biter = slotOfGenome(world, world.lastBiter[victim]);
    world.lastBiteDeliberate[victim] = biter >= 0 && biteDeliberate(world, biter) ? 1 : 0;
}

/**
 * Logs the killer of an eaten agent when the victim's last noted bite was deliberate. Call at the death, before the slot is freed.
 * @param {Record<string, any>} world the world
 * @param {number} victim the eaten slot
 * @returns {void}
 */
export function noteKill(world, victim) {
    if (
        world.lastBiteDeliberate[victim] === 1 &&
        world.lastBiter[victim] !== 0 &&
        world.killCount < world.killLog.length
    ) {
        world.killLog[world.killCount++] = world.lastBiter[victim];
    }
}

/**
 * Credits the logged kills to the killers that are alive, and empties the log.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function creditKills(world) {
    for (let i = 0; i < world.killCount; i++) {
        const killer = slotOfGenome(world, world.killLog[i]);
        if (killer >= 0) {
            world.deliberateKills[killer] += 1;
        }
    }
    world.killCount = 0;
}
