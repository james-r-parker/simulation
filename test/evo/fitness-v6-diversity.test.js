import { describe, expect, it } from 'vitest';
import {
    FITNESS_V6_DIVERSITY,
    createDiversityGroup,
    createNicheTally,
    nicheOf,
    tallyNiches,
} from '../../js/evo/fitness-v6-diversity.js';

describe('FITNESS_V6_DIVERSITY', () => {
    it('names the doc constants', () => {
        expect(FITNESS_V6_DIVERSITY).toEqual({ DIVERSITY: 0.5, SIZE_LOW: 0.9, SIZE_HIGH: 1.1 });
        expect(Object.isFrozen(FITNESS_V6_DIVERSITY)).toBe(true);
    });
});

describe('nicheOf', () => {
    it('uses the specialisation and the size tercile', () => {
        expect(nicheOf(0, 0.8)).toBe(0);
        expect(nicheOf(0, 1)).toBe(1);
        expect(nicheOf(0, 1.2)).toBe(2);
        expect(nicheOf(4, 1.2)).toBe(14);
    });

    it('puts the cut points in the middle tercile', () => {
        expect(nicheOf(1, 0.9)).toBe(4);
        expect(nicheOf(1, 1.1)).toBe(4);
    });
});

describe('createNicheTally', () => {
    it('has 15 niches', () => {
        expect(createNicheTally().count).toBe(15);
    });
});

describe('tallyNiches', () => {
    const world = {
        config: { baseSize: 25 },
        alive: Uint8Array.of(1, 1, 1, 0, 1),
        spec: Uint8Array.of(0, 0, 2, 2, 0),
        baseSize: Float64Array.of(20, 25, 30, 30, 25),
    };

    it('sets each niche share of the alive agents', () => {
        const tally = createNicheTally();
        tallyNiches(tally, world);
        expect(tally.shares[0]).toBe(0.25);
        expect(tally.shares[1]).toBe(0.5);
        expect(tally.shares[8]).toBe(0.25);
        expect(Array.from(tally.shares).reduce((a, b) => a + b)).toBe(1);
    });

    it('replaces the previous shares, and leaves all 0 when nobody is alive', () => {
        const tally = createNicheTally();
        tallyNiches(tally, world);
        tallyNiches(tally, { ...world, alive: new Uint8Array(5) });
        expect(Array.from(tally.shares).every((s) => s === 0)).toBe(true);
    });
});

describe('createDiversityGroup', () => {
    const tally = { count: 15, shares: Float64Array.of(0, 1 / 15, 2 / 15, 0.5) };
    const g = createDiversityGroup();

    it('pays up to 1 + DIVERSITY for an empty niche', () => {
        expect(g.factor(tally, 0)).toBe(1.5);
    });

    it('is 1 for an even share', () => {
        expect(g.factor(tally, 1)).toBeCloseTo(1, 12);
    });

    it('falls linearly for a common niche', () => {
        expect(g.factor(tally, 2)).toBeCloseTo(0.75, 12);
    });

    it('clamps at 1 - DIVERSITY / 2', () => {
        expect(g.factor(tally, 3)).toBe(0.75);
    });

    it('honours an override', () => {
        const h = createDiversityGroup({ DIVERSITY: 0.2 });
        expect(h.factor(tally, 0)).toBe(1.2);
        expect(h.factor(tally, 3)).toBe(0.9);
        expect(h.weights.DIVERSITY).toBe(0.2);
    });
});
