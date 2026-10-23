// The predator economy keys (fitness-and-selection T15f): each reaches the predator path, hand-built worlds. That the
// defaults change nothing is held by the golden hashes, not by a test here.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { applyCosts, updateSize } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { addBlob, imbalance, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const PREDATOR = 1;
const FORAGER = 0;

/**
 * A predator at (100, 100) with 500 energy bites a forager beside it once.
 * @param {number} victimEnergy the forager's energy
 * @param {Record<string, any>} over config overrides
 * @returns {{biterEnergy: number, balance: number}} the biter's energy after the bite and the ledger imbalance
 */
function biteOnce(victimEnergy, over) {
    const w = lifeWorld({ biteArc: Math.PI / 4, ...over });
    const biter = addBlob(w, { spec: PREDATOR, energy: 500, x: 100, y: 100, angle: 0 });
    const victim = addBlob(w, { spec: FORAGER, energy: victimEnergy, x: 110, y: 100, angle: 0 });
    updateSize(w, biter);
    updateSize(w, victim);
    w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    w.contacts[0] = biter;
    w.contacts[1] = victim;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
    return { biterEnergy: w.energy[biter], balance: imbalance(w) };
}

describe('predatorKillEnergy', () => {
    it('pays the biter that empties its victim, on top of the energy bitten', () => {
        expect(biteOnce(5, {}).biterEnergy).toBe(505);
        expect(biteOnce(5, { predatorKillEnergy: 150 }).biterEnergy).toBe(655);
    });

    it('books the payment as inflow, so the ledger still balances', () => {
        expect(biteOnce(5, { predatorKillEnergy: 150 }).balance).toBeCloseTo(0, 9);
    });

    it('pays nothing for a bite that leaves the victim alive', () => {
        const base = biteOnce(5000, {});
        expect(biteOnce(5000, { predatorKillEnergy: 150 }).biterEnergy).toBe(base.biterEnergy);
    });
});

describe('passiveLossMultiplier', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @returns {number[]} the energy the forager and the predator each lose in one tick
     */
    function losses(over) {
        const w = lifeWorld(over);
        addBlob(w, { spec: FORAGER, energy: 500 });
        addBlob(w, { spec: PREDATOR, energy: 500 });
        applyCosts(w);
        return [500 - w.energy[0], 500 - w.energy[1]];
    }

    it('scales that specialisation standing loss only', () => {
        const base = losses({});
        const cut = losses({ specialisations: { predator: { passiveLossMultiplier: 0.5 } } });
        expect(cut[0]).toBe(base[0]);
        expect(cut[1]).toBeCloseTo(base[1] / 2, 12);
    });
});

describe('splitMinEnergyMultiplier', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @returns {number} the alive agents after a predator with 600 energy gets its chance to split
     */
    function populationAfterSplit(over) {
        const w = lifeWorld(over);
        addBlob(w, { spec: PREDATOR, energy: 600 });
        splitAll(w, recordingPolicy([]));
        return w.population;
    }

    it('lowers the threshold for that specialisation: 600 splits at 0.6 x 900 = 540 but not at 900', () => {
        expect(populationAfterSplit({})).toBe(1);
        expect(populationAfterSplit({ specialisations: { predator: { splitMinEnergyMultiplier: 0.6 } } })).toBe(2);
    });

    it('leaves other specialisations on splitMinEnergy', () => {
        const w = lifeWorld({ specialisations: { predator: { splitMinEnergyMultiplier: 0.6 } } });
        addBlob(w, { spec: FORAGER, energy: 600 });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(1);
    });
});
