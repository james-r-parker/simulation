import { describe, expect, it } from 'vitest';
import { FITNESS_V6, createFitnessV6 } from '../../js/evo/fitness-v6.js';
import { FITNESS_V6_SKILL } from '../../js/evo/fitness-v6-skill.js';

const INTENT = [
    'deliberateFood',
    'deliberateBite',
    'chanceFood',
    'chanceBite',
    'respondedEscape',
    'idleSignal',
    'undefendedBite',
    'deliberateKills',
    'convergedKills',
    'alarmCredits',
    'huntCredits',
];

/**
 * A stand-in observer with slot 0 filled in; the spec is unknown, so there is no role term.
 * @param {Record<string, number>} fields intent counters or `ageTicks`, `children`, `matings`, `chaseTicks`, `patches`
 * @returns {any}
 */
function observerWith(fields) {
    const intent = Object.fromEntries(INTENT.map((k) => [k, Float64Array.of(fields[k] ?? 0)]));
    return {
        intent,
        spec: Uint8Array.of(99),
        ageTicks: Float64Array.of(fields.ageTicks ?? 0),
        children: Uint32Array.of(fields.children ?? 0),
        matings: Uint32Array.of(fields.matings ?? 0),
        maturedChildren: Uint32Array.of(0),
        descendantsAlive: Uint32Array.of(0),
        chaseTicks: Uint32Array.of(fields.chaseTicks ?? 0),
        niche: Uint8Array.of(fields.niche ?? 0),
        watch: { visited: Uint32Array.of(fields.patches ?? 0) },
    };
}

const config = {
    specialisations: Object.fromEntries(
        ['forager', 'predator', 'reproducer', 'scout', 'defender'].map((name, index) => [name, { index }]),
    ),
};
const score = (/** @type {Record<string, number>} */ fields, overrides = {}) =>
    createFitnessV6({}, overrides)(observerWith(fields), 0, config);

describe('FITNESS_V6', () => {
    it('holds every constant of the doc table, frozen', () => {
        expect(FITNESS_V6).toMatchObject({
            ...FITNESS_V6_SKILL,
            MATING: 100,
            CHASE_CAP: 600,
            DIVERSITY: 0.5,
            BORN: 50,
        });
        expect(Object.isFrozen(FITNESS_V6)).toBe(true);
    });
});

describe('createFitnessV6', () => {
    it('scores 0 for an agent that did nothing', () => {
        expect(score({})).toBe(0);
    });

    it('pays intake and survival at a full gate, plus BORN per child', () => {
        expect(score({ deliberateFood: 1000, ageTicks: 100 })).toBe(1050);
        expect(score({ deliberateFood: 1000, ageTicks: 100, children: 2 })).toBe(1150);
    });

    it('pays BORN ungated: a blob that never feeds on purpose earns BORN only', () => {
        expect(score({ children: 3, matings: 5, chaseTicks: 100, patches: 3 })).toBe(150);
    });

    it('ramps the lineage and watch groups with the gate', () => {
        expect(score({ deliberateFood: 250, matings: 1, chaseTicks: 100 })).toBe(250 + 0.5 * (100 + 50));
        expect(score({ deliberateFood: 500, matings: 1, chaseTicks: 100 })).toBe(500 + 100 + 50);
        expect(score({ deliberateFood: 5000, matings: 1, chaseTicks: 100 })).toBe(5000 + 100 + 50);
    });

    it('pays a pack kill to its biters through convergedKills, in the skill group and under its cap', () => {
        expect(score({ deliberateFood: 500, convergedKills: 2 })).toBe(500 + 100);
        expect(score({ deliberateFood: 500, convergedKills: 200 })).toBe(500 + 125);
    });

    it('caps each capped term', () => {
        const base = { deliberateFood: 500 };
        expect(score({ ...base, chaseTicks: 9999 })).toBe(500 + 300);
        expect(score({ ...base, patches: 99 })).toBe(500 + 320);
    });

    it('subtracts waste, capped at WASTE_CAP of positive', () => {
        expect(score({ deliberateFood: 1000, ageTicks: 100, idleSignal: 10 })).toBe(1050 - 200);
        expect(score({ deliberateFood: 1000, ageTicks: 100, idleSignal: 1000 })).toBe(525);
    });

    it('never goes below 0', () => {
        expect(score({ idleSignal: 100, undefendedBite: 100 })).toBe(0);
    });

    it('applies the overrides to the right group and exposes the merged weights', () => {
        const f = createFitnessV6({}, { BORN: 10, CHASE: 1, MATING: 1 });
        expect(f.weights).toMatchObject({ BORN: 10, CHASE: 1, MATING: 1, CHASE_CAP: 600 });
        expect(f(observerWith({ deliberateFood: 500, children: 1, chaseTicks: 10, matings: 2 }), 0, config)).toBe(
            500 + 10 + 10 + 2,
        );
        expect(FITNESS_V6.BORN).toBe(50);
    });

    it('rejects an unknown weight', () => {
        expect(() => createFitnessV6({}, { NOPE: 1 })).toThrow(/NOPE/);
    });
});

describe('diversity in fitnessV6', () => {
    const f = createFitnessV6({});
    const withTally = (/** @type {number} */ share, count = 15) => ({
        ...observerWith({ deliberateFood: 1000 }),
        niche: Uint8Array.of(2),
        nicheTally: { count, shares: Float64Array.of(0, 0, share) },
    });

    it('multiplies by the niche factor', () => {
        expect(f(withTally(0), 0, config)).toBe(1000 * 1.5);
        expect(f(withTally(1 / 15), 0, config)).toBeCloseTo(1000, 9);
        expect(f(withTally(2 / 15), 0, config)).toBeCloseTo(1000 * 0.75, 9);
    });

    it('is 1 without a tally', () => {
        expect(f(observerWith({ deliberateFood: 1000 }), 0, config)).toBe(1000);
    });
});

describe('fitnessV6 parts', () => {
    const f = createFitnessV6({});
    const parts = () => ({ skill: 0, waste: 0, lineage: 0, watch: 0, diversityFactor: 0 });

    it('reports each group as paid, the gated lineage and watch included', () => {
        const o = observerWith({ deliberateFood: 250, matings: 1, chaseTicks: 100, idleSignal: 2 });
        expect(f.parts(o, 0, config, parts())).toEqual({
            skill: 250,
            waste: 40,
            lineage: 50,
            watch: 25,
            diversityFactor: 1,
        });
    });

    it('reports the niche factor when there is a tally', () => {
        const o = { ...observerWith({}), nicheTally: { count: 5, shares: Float64Array.of(0.2) } };
        expect(f.parts(o, 0, config, parts()).diversityFactor).toBe(1);
        o.nicheTally.shares[0] = 0;
        expect(f.parts(o, 0, config, parts()).diversityFactor).toBe(1.5);
    });
});
