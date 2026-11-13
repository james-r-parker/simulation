// The eat-choice contact tally (eat-choice.md, T27): in the feed phase, where `tryEat` tests contact and before the
// item is removed, every contact of a non-hunter with food it can eat now is counted, with whether the agent holds `BITE`,
// and again when its store is in the full band. Counting here, not after the step, keeps the tally unbiased by feeding: a
// forager that bites eats the item it touches in the same tick, so a sample taken after the step would miss it.
// The counters are observer scratch (`world.eatContacts`): the step writes them and never reads them, and no hash covers them.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';

/** The lowest store fraction of the full band (`canEatNow` closes at `satiationShare`, so the band is this up to it). */
export const FULL_SHARE = 0.8;

/** Where each count sits in `world.eatContacts`. */
export const EAT_CONTACT = Object.freeze({ CONTACT: 0, CONTACT_BITE: 1, FULL: 2, FULL_BITE: 3, COUNT: 4 });

/**
 * Counts one contact of a non-hunter with edible food, in the full band too when its store is there.
 * @param {Record<string, any>} world the world
 * @param {number} slot a non-hunter that touches food it can eat now
 * @returns {void}
 */
export function tallyEatContact(world, slot) {
    const counts = world.eatContacts;
    const bites = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 ? 1 : 0;
    counts[EAT_CONTACT.CONTACT] += 1;
    counts[EAT_CONTACT.CONTACT_BITE] += bites;
    if (world.energy[slot] >= FULL_SHARE * world.maxEnergyBySpec[world.spec[slot]]) {
        counts[EAT_CONTACT.FULL] += 1;
        counts[EAT_CONTACT.FULL_BITE] += bites;
    }
}
