// Sated bite (realistic-keepers T1, adopted at T22): a canHunt biter for which canEatNow is false (full, or digesting) skips the bite
// entirely; a hungry hunter and a non-hunter leave the bite as it was.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { updateSize } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const PREY_ENERGY = 100;

/**
 * @param {Record<string, any>} over config overrides
 * @param {number} spec the biter's specialisation
 * @param {{energy?: number, ateTimer?: number}} biter the biter's state
 * @returns {{w: any, biter: number, prey: number}} a world with a biter beside a prey that is not biting back
 */
function setup(over, spec, { energy = 100, ateTimer = 100000 } = {}) {
    const w = lifeWorld({ biteArc: Math.PI / 4, recoilEnergy: 20, ...over });
    const biter = addBlob(w, { spec, energy, x: 100, y: 100, angle: 0 });
    const prey = addBlob(w, { spec: FORAGER, energy: PREY_ENERGY, x: 110, y: 100, angle: 0 });
    for (const slot of [biter, prey]) {
        updateSize(w, slot);
    }
    w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    w.ateTimer[biter] = ateTimer;
    return { w, biter, prey };
}

/**
 * @param {any} w the world
 * @param {number} biter the biter
 * @param {number} prey the other
 * @returns {void}
 */
function run(w, biter, prey) {
    w.contacts[0] = biter;
    w.contacts[1] = prey;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

describe('sated bite', () => {
    const on = { satiationShare: 0.9, digestTicks: 30 };

    it('a full hunter does not bite, recoil or hurt the victim', () => {
        const { w, biter, prey } = setup(on, PREDATOR);
        const full = 0.9 * w.maxEnergyBySpec[PREDATOR];
        w.energy[biter] = full;
        run(w, biter, prey);
        expect(w.energy[prey]).toBe(PREY_ENERGY);
        expect(w.energy[biter]).toBe(full);
    });

    it('a digesting hunter does not bite', () => {
        const { w, biter, prey } = setup(on, PREDATOR, { ateTimer: 10 });
        run(w, biter, prey);
        expect(w.energy[prey]).toBe(PREY_ENERGY);
        expect(w.energy[biter]).toBe(100);
    });

    it('a hungry hunter bites', () => {
        const { w, biter, prey } = setup(on, PREDATOR);
        run(w, biter, prey);
        expect(w.energy[prey]).toBeLessThan(PREY_ENERGY);
    });

    it('a non-hunter biter is unaffected', () => {
        const { w, biter, prey } = setup(on, FORAGER, { ateTimer: 10 });
        const before = w.energy[biter];
        run(w, biter, prey);
        expect(w.energy[prey]).toBe(PREY_ENERGY);
        expect(w.energy[biter]).toBe(before);
    });
});
