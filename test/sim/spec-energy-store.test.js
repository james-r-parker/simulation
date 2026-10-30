// maxEnergyMultiplier: each specialisation's energy store is `maxEnergy` x its multiplier. Hand-built worlds; that the
// default of 1 changes nothing is held by the golden hashes.

import { describe, expect, it } from 'vitest';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy, transferEnergy } from '../../js/sim/energy.js';
import { canEatNow } from '../../js/sim/feeding.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {Record<string, any>} w the world
 * @param {number} spec the specialisation index
 * @returns {number} a new agent's slot
 */
function agent(w, spec) {
    const slot = allocBody(w);
    w.spec[slot] = spec;
    return slot;
}

describe('maxEnergyMultiplier', () => {
    const over = { maxEnergy: 1000, satiationShare: 0.5, specialisations: { predator: { maxEnergyMultiplier: 3 } } };

    it('builds the per-specialisation store table from maxEnergy', () => {
        const w = smallWorld(over);
        expect(Array.from(w.maxEnergyBySpec)).toEqual([1000, 3000, 1000, 1000, 1000]);
    });

    it('lets a predator store 3x maxEnergy and a forager only 1x', () => {
        const w = smallWorld(over);
        const p = agent(w, PREDATOR);
        const f = agent(w, FORAGER);
        expect(addEnergy(w, p, 5000, ENERGY_SOURCE.INITIAL)).toBe(3000);
        expect(addEnergy(w, f, 5000, ENERGY_SOURCE.INITIAL)).toBe(1000);
    });

    it('caps a transfer at the receiver own store', () => {
        const w = smallWorld(over);
        const giver = agent(w, FORAGER);
        const receiver = agent(w, PREDATOR);
        addEnergy(w, giver, 1000, ENERGY_SOURCE.INITIAL);
        addEnergy(w, receiver, 2500, ENERGY_SOURCE.INITIAL);
        transferEnergy(w, giver, receiver, 1000);
        expect(w.energy[receiver]).toBe(3000);
    });

    it('stops eating at satiationShare of its own store', () => {
        const w = smallWorld(over);
        const p = agent(w, PREDATOR);
        const f = agent(w, FORAGER);
        w.ateTimer[p] = 30;
        w.ateTimer[f] = 30;
        addEnergy(w, p, 1400, ENERGY_SOURCE.INITIAL);
        addEnergy(w, f, 600, ENERGY_SOURCE.INITIAL);
        expect(canEatNow(w, p)).toBe(true); // 1400 < 0.5 x 3000
        expect(canEatNow(w, f)).toBe(false); // 600 >= 0.5 x 1000
        addEnergy(w, p, 100, ENERGY_SOURCE.INITIAL);
        expect(canEatNow(w, p)).toBe(false);
    });

    it('feeds the brain its energy over its own store', () => {
        const w = smallWorld(over);
        const p = agent(w, PREDATOR);
        addEnergy(w, p, 1500, ENERGY_SOURCE.INITIAL);
        writeBodyInputs(w, p);
        expect(w.inputs[p * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS]).toBeCloseTo(0.5, 6);
    });

    it('rejects an initialEnergy above the smallest store', () => {
        expect(() =>
            smallWorld({ initialEnergy: 900, specialisations: { scout: { maxEnergyMultiplier: 0.25 } } }),
        ).toThrow(/initialEnergy/);
    });
});
