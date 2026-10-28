import { describe, expect, it } from 'vitest';
import { creditEscape, creditIntake, creditMating, creditMatured, meritNow } from '../../js/sim/merit.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

/** @returns {any} a world with the merit keys at their documented defaults */
function world() {
    return lifeWorld({ maxAgents: 8, meritEnabled: true });
}

/**
 * Adds a mother, a father and their child with the parent links a mating birth sets.
 * @param {any} w the world
 * @returns {number[]} mother, father and child slots
 */
function family(w) {
    const mother = addBlob(w);
    const father = addBlob(w);
    const child = addBlob(w);
    w.parentA[child] = w.genomeId[mother];
    w.parentB[child] = w.genomeId[father];
    w.parentSlotA[child] = mother;
    w.parentSlotB[child] = father;
    return [mother, father, child];
}

describe('creditIntake', () => {
    it('adds deliberate energy in full to merit and deliberateIntake', () => {
        const w = world();
        const s = addBlob(w);
        creditIntake(w, s, 40, true);
        expect(w.merit[s]).toBe(40);
        expect(w.deliberateIntake[s]).toBe(40);
    });

    it('adds chance energy at meritChanceWeight and leaves deliberateIntake alone', () => {
        const w = world();
        const s = addBlob(w);
        creditIntake(w, s, 40, false);
        expect(w.merit[s]).toBe(w.config.meritChanceWeight * 40);
        expect(w.deliberateIntake[s]).toBe(0);
    });

    it('does not decay deliberateIntake', () => {
        const w = world();
        const s = addBlob(w);
        creditIntake(w, s, 40, true);
        w.tick = 5 * w.config.meritHalfLife;
        creditIntake(w, s, 10, true);
        expect(w.deliberateIntake[s]).toBe(50);
    });
});

describe('bonuses', () => {
    it('credits the mating and escape bonuses', () => {
        const w = world();
        const s = addBlob(w);
        creditMating(w, s);
        creditEscape(w, s);
        expect(w.merit[s]).toBe(w.config.meritMateBonus + w.config.meritEscapeBonus);
    });
});

describe('decay', () => {
    it('halves after one half-life and restamps', () => {
        const w = world();
        const s = addBlob(w);
        creditMating(w, s);
        w.tick = w.config.meritHalfLife;
        expect(meritNow(w, s)).toBeCloseTo(w.config.meritMateBonus / 2, 9);
        expect(w.meritStamp[s]).toBe(w.tick);
        expect(meritNow(w, s)).toBeCloseTo(w.config.meritMateBonus / 2, 9);
    });

    it('decays before adding a credit', () => {
        const w = world();
        const s = addBlob(w);
        creditMating(w, s);
        w.tick = 2 * w.config.meritHalfLife;
        creditEscape(w, s);
        expect(w.merit[s]).toBeCloseTo(w.config.meritMateBonus / 4 + w.config.meritEscapeBonus, 9);
    });

    it('is the same whether read in steps or once', () => {
        const a = world();
        const b = world();
        const sa = addBlob(a);
        const sb = addBlob(b);
        creditMating(a, sa);
        creditMating(b, sb);
        for (let t = 1000; t <= 7000; t += 1000) {
            a.tick = t;
            meritNow(a, sa);
        }
        b.tick = 7000;
        expect(meritNow(a, sa)).toBeCloseTo(meritNow(b, sb), 9);
    });

    it('keeps merit when meritHalfLife is 0', () => {
        const w = lifeWorld({ maxAgents: 4, meritHalfLife: 0 });
        const s = addBlob(w);
        creditMating(w, s);
        w.tick = 1e6;
        expect(meritNow(w, s)).toBe(w.config.meritMateBonus);
    });

    it('goes to zero after very many half-lives without a non-finite value', () => {
        const w = world();
        const s = addBlob(w);
        creditMating(w, s);
        w.tick = 1e9;
        expect(meritNow(w, s)).toBe(0);
    });

    it('is 0 for a fresh slot', () => {
        const w = world();
        w.tick = 500;
        expect(meritNow(w, addBlob(w))).toBe(0);
    });
});

describe('creditMatured', () => {
    it('credits both living parents', () => {
        const w = world();
        const [mother, father, child] = family(w);
        expect(creditMatured(w, child)).toBe(2);
        expect(w.merit[mother]).toBe(w.config.meritChildBonus);
        expect(w.merit[father]).toBe(w.config.meritChildBonus);
        expect(w.merit[child]).toBe(0);
    });

    it('skips a parent that died', () => {
        const w = world();
        const [mother, father, child] = family(w);
        freeAgent(w, father);
        expect(creditMatured(w, child)).toBe(1);
        expect(w.merit[mother]).toBe(w.config.meritChildBonus);
        expect(w.merit[father]).toBe(0);
    });

    it('skips a parent slot reused by another agent', () => {
        const w = world();
        const [mother, father, child] = family(w);
        freeAgent(w, father);
        const stranger = addBlob(w);
        expect(stranger).toBe(father);
        expect(creditMatured(w, child)).toBe(1);
        expect(w.merit[mother]).toBe(w.config.meritChildBonus);
        expect(w.merit[stranger]).toBe(0);
    });

    it('skips unknown parents (slot -1)', () => {
        const w = world();
        const [, , child] = family(w);
        w.parentSlotA[child] = -1;
        w.parentSlotB[child] = -1;
        expect(creditMatured(w, child)).toBe(0);
    });

    it('credits a split parent once', () => {
        const w = world();
        const mother = addBlob(w);
        const child = addBlob(w);
        w.parentA[child] = w.parentB[child] = w.genomeId[mother];
        w.parentSlotA[child] = w.parentSlotB[child] = mother;
        expect(creditMatured(w, child)).toBe(1);
        expect(w.merit[mother]).toBe(w.config.meritChildBonus);
    });
});
