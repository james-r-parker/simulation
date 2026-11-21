// A small world with hand-placed bodies and a contact list, for the tests of what a bite, a call or a shove does to a body.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy } from '../../../js/sim/energy.js';
import { feed } from '../../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../../js/sim/spatial-hash.js';
import { allocBody } from './body.js';
import { smallWorld } from './small-world.js';

/** The neutral predator: a bite moves whole `biteEnergy` units and costs the biter nothing. */
export const NEUTRAL = {
    huntSizeRatio: 1.01,
    biteCost: 0,
    maxEnergy: 25000,
    specialisations: { predator: { biteMultiplier: 1, turnMultiplier: 1, sprintBoost: 1, maxEnergyMultiplier: 1 } },
};

export const FORAGER = 0;
export const PREDATOR = 1;

/**
 * @typedef {object} Body
 * @property {number} x
 * @property {number} spec a `SPEC` code
 * @property {number} energy
 * @property {number} [y]
 * @property {boolean} [bite] whether it holds `BITE` (a hunter does by default)
 */

/**
 * @param {Record<string, any>} over config overrides, over `NEUTRAL`
 * @param {Body[]} bodies the bodies, in slot order, all at y 100 unless they say otherwise
 * @returns {{w: any, slots: number[]}} the world and the slots
 */
export function stage(over, bodies) {
    const w = smallWorld({ ...NEUTRAL, ...over });
    const slots = bodies.map((body) => {
        const slot = allocBody(w);
        w.x[slot] = body.x;
        w.y[slot] = body.y ?? 100;
        w.spec[slot] = body.spec;
        w.genomeId[slot] = slot + 1;
        addEnergy(w, slot, body.energy, ENERGY_SOURCE.INITIAL);
        w.ateTimer[slot] = 30;
        w.bittenTimer[slot] = 30;
        w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = (body.bite ?? body.spec === PREDATOR) ? 1 : 0;
        return slot;
    });
    return { w, slots };
}

/**
 * Runs the feed phase over contact pairs.
 * @param {any} w the world
 * @param {number[]} pairs the contacts, flattened
 * @returns {void}
 */
export function feedPairs(w, pairs) {
    pairs.forEach((slot, i) => {
        w.contacts[i] = slot;
    });
    w.contactCount = pairs.length / 2;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}
