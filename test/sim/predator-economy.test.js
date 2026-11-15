// The predator economy keys (fitness-and-selection T15f): each reaches the predator path, hand-built worlds. That the
// defaults change nothing is held by the golden hashes, not by a test here.

import { describe, expect, it } from 'vitest';
import { applyCosts } from '../../js/sim/energy.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const PREDATOR = 1;
const FORAGER = 0;

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
