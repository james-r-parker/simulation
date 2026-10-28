import { describe, expect, it } from 'vitest';
import { BLOCKED_CAUSE, EVENT_TYPE } from '../../js/sim/events.js';
import { advancePregnancies, splitAll } from '../../js/sim/reproduction.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const MERIT_ON = { meritEnabled: true, meritHalf: 1000, childEnergyShare: 0.5, childEnergyMin: 100 };

/**
 * A pregnant mother due to give birth, with the given energy and merit.
 * @param {number} energy the mother's energy
 * @param {number} merit the mother's merit (stamped at tick 0)
 * @param {Record<string, any>} over config overrides
 * @returns {any} the world
 */
function due(energy, merit, over) {
    const w = lifeWorld({ ...MERIT_ON, ...over });
    const m = addBlob(w, { pregnancy: 1, energy });
    w.merit[m] = merit;
    return w;
}

/**
 * @param {any} w the world
 * @returns {number} the gift the first birth made (the child's energy)
 */
function birthGift(w) {
    advancePregnancies(w, recordingPolicy([]));
    return w.energy[1];
}

describe('birth gift by merit (mating)', () => {
    it('gives the unscaled gift at boost 0, to the bit, with merit on and any merit', () => {
        const off = due(777.7, 0, { meritEnabled: false, meritBirthBoost: 0 });
        const on = due(777.7, 123456, { meritBirthBoost: 0 });
        const base = birthGift(off);
        expect(base).toBeGreaterThan(0);
        expect(Object.is(birthGift(on), base)).toBe(true);
        expect(Object.is(on.energy[0], off.energy[0])).toBe(true);
    });

    it('ignores merit and boost when merit is off', () => {
        const w = due(800, 5000, { meritEnabled: false, meritBirthBoost: 0.5 });
        expect(birthGift(w)).toBe(400);
    });

    it('gives 1 - boost of the gift at merit 0', () => {
        expect(birthGift(due(800, 0, { meritBirthBoost: 0.4 }))).toBeCloseTo(400 * 0.6, 9);
    });

    it('gives 1 + boost x (2m - 1) at m = 0.5 as exactly the plain gift', () => {
        expect(birthGift(due(800, 1000, { meritBirthBoost: 0.4 }))).toBeCloseTo(400, 9);
    });

    it('approaches 1 + boost at large merit', () => {
        expect(birthGift(due(800, 1e12, { meritBirthBoost: 0.4 }))).toBeCloseTo(400 * 1.4, 4);
    });

    it('reads merit decayed to the tick without restamping it', () => {
        const w = due(800, 4000, { meritBirthBoost: 0.4, meritHalfLife: 100 });
        w.tick = 100;
        const m = 2000 / (2000 + 1000);
        expect(birthGift(w)).toBeCloseTo(400 * (1 + 0.4 * (2 * m - 1)), 6);
        expect([w.merit[0], w.meritStamp[0]]).toEqual([4000, 0]);
    });

    it('caps the gift at 0.9 of the mother energy and leaves her the rest', () => {
        const w = due(800, 1e12, { meritBirthBoost: 0.5, childEnergyShare: 0.8 });
        expect(birthGift(w)).toBeCloseTo(720, 9);
        expect(w.energy[0]).toBeCloseTo(80, 9);
    });

    it('checks childEnergyMin on the scaled gift, blocking a poor mother and keeping her energy', () => {
        const w = due(250, 0, { meritBirthBoost: 0.5 });
        expect(250 * 0.5).toBeGreaterThanOrEqual(100);
        expect(250 * 0.5 * 0.5).toBeLessThan(100);
        advancePregnancies(w, recordingPolicy([]));
        expect(w.population).toBe(1);
        expect(w.energy[0]).toBe(250);
        const d = w.events.data;
        expect(d[2]).toBe(0);
        expect(d[3]).toBe(BLOCKED_CAUSE.ENERGY);
        expect(d[0]).toBe(EVENT_TYPE.BIRTH_BLOCKED);
    });

    it('lets high merit rescue a gift that the plain share would block', () => {
        const w = due(190, 1e12, { meritBirthBoost: 0.5 });
        expect(birthGift(w)).toBeCloseTo(190 * 0.5 * 1.5, 6);
    });
});

describe('birth gift by merit (split)', () => {
    /**
     * @param {number} merit the splitter's merit
     * @param {Record<string, any>} over config overrides
     * @returns {any} the world after one split of an agent with 1000 energy
     */
    function split(merit, over) {
        const w = lifeWorld({ ...MERIT_ON, ...over });
        const s = addBlob(w, { energy: 1000 });
        w.merit[s] = merit;
        splitAll(w, recordingPolicy([]));
        return w;
    }

    it('scales half the energy by the factor', () => {
        expect(split(0, { meritBirthBoost: 0.5 }).energy[1]).toBeCloseTo(250, 9);
        expect(split(1e12, { meritBirthBoost: 0.5 }).energy[1]).toBeCloseTo(750, 4);
    });

    it('gives exactly half at boost 0 and when merit is off', () => {
        expect(split(5, { meritBirthBoost: 0 }).energy[1]).toBe(500);
        expect(split(5, { meritEnabled: false, meritBirthBoost: 0.5 }).energy[1]).toBe(500);
    });

    it('never leaves the splitter below a tenth of her energy', () => {
        const w = split(1e12, { meritBirthBoost: 0.5 });
        expect(w.energy[0]).toBeGreaterThanOrEqual(250);
        expect(w.energy[0] + w.energy[1]).toBeCloseTo(1000, 9);
    });
});
