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
 * @param {Record<string, number>} fields intent counters or `ageTicks`, `children`, `maturedChildren`, `descendantsAlive`, and the act counters no term reads
 * @returns {any}
 */
function observerWith(fields) {
    const intent = Object.fromEntries(INTENT.map((k) => [k, Float64Array.of(fields[k] ?? 0)]));
    return {
        intent,
        spec: Uint8Array.of(99),
        ageTicks: Float64Array.of(fields.ageTicks ?? 0),
        children: Uint32Array.of(fields.children ?? 0),
        maturedChildren: Uint32Array.of(fields.maturedChildren ?? 0),
        descendantsAlive: Uint32Array.of(fields.descendantsAlive ?? 0),
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
            MATURED: 250,
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

    it('ramps the lineage group with the gate', () => {
        expect(score({ deliberateFood: 250, maturedChildren: 1 })).toBe(250 + 0.5 * 250);
        expect(score({ deliberateFood: 500, maturedChildren: 1 })).toBe(500 + 250);
        expect(score({ deliberateFood: 5000, maturedChildren: 1 })).toBe(5000 + 250);
    });

    it('pays no act terms: chasing, migrating, mating, calling and sounding an alarm earn nothing', () => {
        const act = { matings: 5, chaseTicks: 100, patches: 3, alarmCredits: 4, huntCredits: 4, alarmCalls: 4 };
        expect(score({ deliberateFood: 500, ...act })).toBe(score({ deliberateFood: 500 }));
        for (const key of ['CHASE', 'CHASE_CAP', 'MIGRATE', 'MIGRATE_CAP', 'MATING', 'ALARM', 'HUNT_CALL']) {
            expect(FITNESS_V6, key).not.toHaveProperty(key);
        }
    });

    it('pays a pack kill to its biters through convergedKills, in the skill group and under its cap', () => {
        expect(score({ deliberateFood: 500, convergedKills: 2 })).toBe(500 + 100);
        expect(score({ deliberateFood: 500, convergedKills: 200 })).toBe(500 + 125);
    });

    it('caps the family term', () => {
        const base = { deliberateFood: 500 };
        expect(score({ ...base, descendantsAlive: 99 })).toBe(500 + 400);
    });

    it('subtracts waste, capped at WASTE_CAP of positive', () => {
        expect(score({ deliberateFood: 1000, ageTicks: 100, idleSignal: 10 })).toBe(1050 - 200);
        expect(score({ deliberateFood: 1000, ageTicks: 100, idleSignal: 1000 })).toBe(525);
    });

    it('never goes below 0', () => {
        expect(score({ idleSignal: 100, undefendedBite: 100 })).toBe(0);
    });

    it('applies the overrides to the right group and exposes the merged weights', () => {
        const f = createFitnessV6({}, { BORN: 10, MATURED: 1 });
        expect(f.weights).toMatchObject({ BORN: 10, MATURED: 1, FAMILY_CAP: 10 });
        expect(f(observerWith({ deliberateFood: 500, children: 1, maturedChildren: 2 }), 0, config)).toBe(500 + 10 + 2);
        expect(FITNESS_V6.BORN).toBe(50);
    });

    it('rejects an unknown weight', () => {
        expect(() => createFitnessV6({}, { NOPE: 1 })).toThrow(/NOPE/);
    });
});

describe('no diversity factor in fitnessV6', () => {
    it('does not pay a rare niche: a niche tally on the observer changes nothing', () => {
        const f = createFitnessV6({});
        const o = {
            ...observerWith({ deliberateFood: 1000 }),
            niche: Uint8Array.of(2),
            nicheTally: { count: 15, shares: Float64Array.of(0, 0, 0) },
        };
        expect(f(o, 0, config)).toBe(1000);
    });

    it('has no DIVERSITY weight to vary: a screen that names it is refused', () => {
        expect(FITNESS_V6).not.toHaveProperty('DIVERSITY');
        expect(() => createFitnessV6({}, { DIVERSITY: 0 })).toThrow(/unknown weight DIVERSITY/);
    });
});

describe('fitnessV6 parts', () => {
    const f = createFitnessV6({});
    const parts = () => ({ skill: 0, waste: 0, lineage: 0 });

    it('reports each group as paid, the gated lineage included', () => {
        const o = observerWith({ deliberateFood: 250, maturedChildren: 1, idleSignal: 2 });
        expect(f.parts(o, 0, config, parts())).toEqual({
            skill: 250,
            waste: 40,
            lineage: 125,
        });
    });
});

describe('fitnessV6 terms', () => {
    const f = createFitnessV6({});
    const terms = () => ({
        intake: 0,
        survival: 0,
        role: 0,
        escape: 0,
        kill: 0,
        born: 0,
        lineage: 0,
        waste: 0,
        fitness: 0,
    });

    it('pays each term as the fitness does, and the terms less the waste sum to the fitness', () => {
        const o = observerWith({ deliberateFood: 250, maturedChildren: 1, idleSignal: 2 });
        const t = f.terms(o, 0, config, terms());
        const p = f.parts(o, 0, config, { skill: 0, waste: 0, lineage: 0 });
        expect(t.fitness).toBe(f(o, 0, config));
        expect(t.intake).toBe(250);
        expect(t.intake + t.survival + t.role + t.escape + t.kill).toBeCloseTo(p.skill, 9);
        expect(t.lineage).toBe(p.lineage);
        expect(t.waste).toBeCloseTo(40, 9);
        const sum = t.intake + t.survival + t.role + t.escape + t.kill + t.born + t.lineage - t.waste;
        expect(sum).toBeCloseTo(t.fitness, 9);
    });
});
