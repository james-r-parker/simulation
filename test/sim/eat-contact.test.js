// The contact tally (eat-choice T27): counted in the feed phase before the item is removed, so a biting forager's contact
// counts although it eats the item.
import { allocBody } from './helpers/body.js';
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { EAT_CONTACT, FULL_SHARE } from '../../js/sim/eat-contact.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { smallWorld } from './helpers/small-world.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {{ spec?: number, bite: number, fraction?: number, x?: number }} a the agent, at (x, 100)
 * @returns {number} the slot
 */
function eater(w, a) {
    const slot = allocBody(w);
    w.x[slot] = a.x ?? 100;
    w.y[slot] = 100;
    w.spec[slot] = a.spec ?? FORAGER;
    w.genomeId[slot] = slot + 1;
    addEnergy(w, slot, (a.fraction ?? 0.5) * w.maxEnergyBySpec[w.spec[slot]], ENERGY_SOURCE.INITIAL);
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = a.bite;
    w.ateTimer[slot] = 30;
    return slot;
}

/** @param {ReturnType<typeof smallWorld>} w @param {number} dx the item's offset from x @param {number} [x] the column of the agent it sits by */
function item(w, dx = 0, x = 100) {
    const slot = w.foodAlive.indexOf(0);
    w.foodAlive[slot] = 1;
    w.foodX[slot] = x + dx;
    w.foodY[slot] = 100;
    w.foodRadius[slot] = 5;
    w.foodValue[slot] = 10;
    w.foodKind[slot] = FOOD_KIND.PLANT;
    w.foodCount++;
    return slot;
}

/** @param {ReturnType<typeof smallWorld>} w @returns {number[]} contact, contact and bite, full, full and bite after a feed */
function tallied(w) {
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
    return Array.from(w.eatContacts);
}

describe('the feed-phase contact tally', () => {
    it('counts a biting forager although it eats the item', () => {
        const w = smallWorld();
        eater(w, { bite: 1 });
        const food = item(w);
        expect(tallied(w)).toEqual([1, 1, 0, 0]);
        expect(w.foodAlive[food]).toBe(0);
    });

    it('counts a non-biting forager as contact only, and the item stays', () => {
        const w = smallWorld();
        eater(w, { bite: -1 });
        const food = item(w);
        expect(tallied(w)).toEqual([1, 0, 0, 0]);
        expect(w.foodAlive[food]).toBe(1);
    });

    it('counts every item touched, and none out of reach', () => {
        const w = smallWorld();
        eater(w, { bite: -1 });
        item(w);
        item(w, 1);
        item(w, 500);
        expect(tallied(w)[EAT_CONTACT.CONTACT]).toBe(2);
    });

    it('does not count a hunter, which eats carcasses without a bite', () => {
        const w = smallWorld();
        eater(w, { spec: PREDATOR, bite: 1 });
        const food = item(w);
        w.foodKind[food] = FOOD_KIND.MEAT;
        expect(tallied(w)).toEqual([0, 0, 0, 0]);
        expect(w.foodAlive[food]).toBe(0);
    });

    it('counts the full band from FULL_SHARE up to the satiation share, and nothing above it', () => {
        const satiationShare = 0.95;
        const w = smallWorld({ satiationShare });
        const fractions = [
            FULL_SHARE + 0.001,
            (FULL_SHARE + satiationShare) / 2,
            FULL_SHARE - 0.05,
            satiationShare + 0.02,
        ];
        const bites = [1, -1, 1, 1];
        fractions.forEach((fraction, i) => {
            eater(w, { bite: bites[i], fraction, x: 100 + 50 * i });
            item(w, 0, 100 + 50 * i);
        });
        const counts = tallied(w);
        expect(counts[EAT_CONTACT.FULL]).toBe(2);
        expect(counts[EAT_CONTACT.FULL_BITE]).toBe(1);
        expect(counts[EAT_CONTACT.CONTACT]).toBe(3);
    });

    it('does not count food the specialisation does not take', () => {
        const w = smallWorld();
        eater(w, { bite: -1 });
        w.meatFoodBySpec[FORAGER] = 0;
        w.foodKind[item(w)] = FOOD_KIND.MEAT;
        expect(tallied(w)).toEqual([0, 0, 0, 0]);
    });
});
