import { describe, expect, it } from 'vitest';
import { birthBudgetSpent, recordBirth } from '../../js/sim/birth-budget.js';
import { canMatePair } from '../../js/sim/mate-eligibility.js';
import { advancePregnancies, mate, splitAll } from '../../js/sim/reproduction.js';
import { freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const ON = { maxBirthsPerWindow: 2, birthWindowTicks: 100, maxAgents: 16 };

/**
 * @param {any} w the world
 * @param {number} slot the mother
 * @param {number} tick the tick to record a birth at
 * @returns {void}
 */
function birthAt(w, slot, tick) {
    w.tick = tick;
    recordBirth(w, slot);
}

describe('birth ring', () => {
    it('is off by default: nothing is recorded or blocked and the ring is empty', () => {
        const w = lifeWorld();
        addBlob(w, { energy: 1200 });
        recordBirth(w, 0);
        expect(w.birthRing.length).toBe(0);
        expect(birthBudgetSpent(w, 0)).toBe(false);
    });

    it('is spent only after maxBirthsPerWindow births inside the window', () => {
        const w = lifeWorld(ON);
        addBlob(w, { energy: 1200 });
        expect(birthBudgetSpent(w, 0)).toBe(false);
        birthAt(w, 0, 0);
        w.tick = 10;
        expect(birthBudgetSpent(w, 0)).toBe(false);
        birthAt(w, 0, 10);
        expect(birthBudgetSpent(w, 0)).toBe(true);
    });

    it('frees the budget the tick the oldest birth leaves the window, and replaces the oldest entry', () => {
        const w = lifeWorld(ON);
        addBlob(w, { energy: 1200 });
        birthAt(w, 0, 0);
        birthAt(w, 0, 10);
        w.tick = 99;
        expect(birthBudgetSpent(w, 0)).toBe(true);
        w.tick = 100;
        expect(birthBudgetSpent(w, 0)).toBe(false);
        birthAt(w, 0, 100);
        w.tick = 105;
        expect(birthBudgetSpent(w, 0)).toBe(true);
        w.tick = 110;
        expect(birthBudgetSpent(w, 0)).toBe(false);
    });

    it('is zeroed with the slot and keeps mothers apart', () => {
        const w = lifeWorld(ON);
        addBlob(w, { energy: 1200 });
        addBlob(w, { energy: 1200 });
        birthAt(w, 0, 5);
        birthAt(w, 0, 6);
        expect(birthBudgetSpent(w, 1)).toBe(false);
        expect(birthBudgetSpent(w, 0)).toBe(true);
        freeAgent(w, 0);
        expect([...w.birthRing.subarray(0, 2)]).toEqual([0, 0]);
    });
});

describe('birth budget in splitting', () => {
    it('stops a mother splitting once spent, and lets her split when the window passes', () => {
        const w = lifeWorld({ ...ON, maxBirthsPerWindow: 1 });
        const policy = recordingPolicy([]);
        addBlob(w, { energy: 1200 });
        splitAll(w, policy);
        expect(w.population).toBe(2);
        expect(w.birthRing[0]).toBe(1);
        w.cooldown[0] = 0;
        w.energy[0] = 1200;
        w.ledger[0] += 1200;
        w.tick = 50;
        splitAll(w, policy);
        expect(w.population).toBe(2);
        w.tick = 100;
        splitAll(w, policy);
        expect(w.population).toBe(3);
    });
});

describe('birth budget in mating', () => {
    const MATE = { mateOut: 1, energy: 700, spec: 2 };

    /**
     * @param {Record<string, any>} over config overrides
     * @returns {any} a world with two mates side by side
     */
    function pairWorld(over) {
        const w = lifeWorld({ mateRange: 100, ...over });
        addBlob(w, MATE);
        addBlob(w, MATE);
        w.x[1] = w.x[0] + 5;
        w.y[1] = w.y[0];
        buildHash(w.hash, w);
        return w;
    }

    it('refuses a pair whose mother has spent her budget, and a birth is recorded for her', () => {
        const w = pairWorld({ ...ON, maxBirthsPerWindow: 1 });
        expect(canMatePair(w, 0, 1)).toBe(true);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[0]).toBeGreaterThan(0);
        w.pregnancy[0] = 1;
        advancePregnancies(w, recordingPolicy([]));
        expect(w.birthRing[0]).toBe(w.tick + 1);
        w.cooldown[0] = 0;
        w.cooldown[1] = 0;
        expect(canMatePair(w, 0, 1)).toBe(false);
    });

    it('counts the female as the mother when sexes are on', () => {
        const w = pairWorld({ ...ON, sexesEnabled: true });
        w.sex[1] = 1;
        birthAt(w, 1, 0);
        birthAt(w, 1, 1);
        expect(canMatePair(w, 0, 1)).toBe(true);
        birthAt(w, 0, 0);
        birthAt(w, 0, 1);
        expect(canMatePair(w, 0, 1)).toBe(false);
    });
});

describe('hashWorld birthRing', () => {
    it('covers the ring only when the budget is on', () => {
        const on = lifeWorld(ON);
        addBlob(on, { energy: 1200 });
        const before = hashWorld(on);
        on.birthRing[0] = 7;
        expect(hashWorld(on)).not.toBe(before);
    });
});
