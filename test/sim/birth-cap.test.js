import { describe, expect, it } from 'vitest';
import { advancePregnancies, splitAll } from '../../js/sim/reproduction.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const ON = { capBirthsEnabled: true, meritHalf: 1000, childEnergyMin: 1 };

/**
 * A world with one pregnant mother due this tick per merit given, then `fillers` idle agents.
 * @param {Record<string, any>} over config overrides
 * @param {number[]} merits one merit per mother, slots 0..n-1
 * @param {number} fillers idle agents added after the mothers
 * @returns {any}
 */
function pregnantWorld(over, merits, fillers) {
    const w = lifeWorld({ ...ON, ...over });
    for (const merit of merits) {
        w.merit[addBlob(w, { energy: 2000, pregnancy: 1 })] = merit;
    }
    for (let i = 0; i < fillers; i++) {
        addBlob(w, { energy: 10 });
    }
    return w;
}

/**
 * @param {any} w the world
 * @param {number} n how many slots to look at
 * @returns {number[]} the slots among the first n that gave birth (their energy fell)
 */
function parents(w, n) {
    const out = [];
    for (let s = 0; s < n; s++) {
        if (w.energy[s] < 2000) {
            out.push(s);
        }
    }
    return out;
}

describe('merit at the cap: pregnancies', () => {
    it('gives the one free slot to the highest merit and makes the rest wait', () => {
        const w = pregnantWorld({ maxAgents: 5 }, [10, 900, 50], 1);
        advancePregnancies(w, recordingPolicy([]));
        expect(parents(w, 3)).toEqual([1]);
        expect([w.pregnancy[0], w.pregnancy[1], w.pregnancy[2]]).toEqual([1, 0, 1]);
        expect(w.population).toBe(5);
    });

    it('breaks a merit tie to the lower slot', () => {
        const w = pregnantWorld({ maxAgents: 5 }, [100, 100, 100], 1);
        advancePregnancies(w, recordingPolicy([]));
        expect(parents(w, 3)).toEqual([0]);
    });

    it('fills several free slots best first', () => {
        const w = pregnantWorld({ maxAgents: 7 }, [5, 700, 300, 700], 1);
        advancePregnancies(w, recordingPolicy([]));
        expect(parents(w, 4)).toEqual([1, 3]);
        expect([w.pregnancy[0], w.pregnancy[2]]).toEqual([1, 1]);
    });

    it('ranks by merit decayed to the tick, without restamping', () => {
        const w = pregnantWorld({ maxAgents: 4, meritHalfLife: 100 }, [1000, 600], 1);
        w.meritStamp[0] = -200;
        advancePregnancies(w, recordingPolicy([]));
        expect(parents(w, 2)).toEqual([1]);
        expect([w.merit[0], w.meritStamp[0]]).toEqual([1000, -200]);
    });

    it('keeps slot order when there is no shortfall', () => {
        const w = pregnantWorld({ maxAgents: 8 }, [1, 900, 50], 0);
        advancePregnancies(w, recordingPolicy([]));
        expect(parents(w, 3)).toEqual([0, 1, 2]);
        expect(w.population).toBe(6);
    });
});

describe('merit at the cap: splits', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @param {number[]} merits one merit per ready agent
     * @returns {any}
     */
    function splitWorld(over, merits) {
        const w = lifeWorld({ ...ON, maxAgents: 8, splitCapMargin: 0, ...over });
        for (const merit of merits) {
            w.merit[addBlob(w, { energy: 2000 })] = merit;
        }
        return w;
    }

    it('gives the free slots below the ceiling to the highest merit', () => {
        const w = splitWorld({ maxAgents: 6 }, [1, 30, 20, 5]);
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(6);
        expect(parents(w, 4)).toEqual([1, 2]);
    });

    it('ties to the lower slot and leaves the losers ready', () => {
        const w = splitWorld({ maxAgents: 4 }, [7, 7, 7]);
        splitAll(w, recordingPolicy([]));
        expect(parents(w, 3)).toEqual([0]);
        expect(w.cooldown[1]).toBe(0);
    });

    it('splits nobody once the population is at the split ceiling', () => {
        const w = splitWorld({ maxAgents: 4, splitCapMargin: 1 }, [1, 30, 20]);
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(3);
    });

    it('splits all in slot order when slots suffice', () => {
        const w = splitWorld({}, [1, 30, 20]);
        splitAll(w, recordingPolicy([]));
        expect(parents(w, 3)).toEqual([0, 1, 2]);
    });
});
