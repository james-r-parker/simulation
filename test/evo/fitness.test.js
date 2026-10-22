import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { FITNESS_V1, createFitnessV1, fitnessV1 } from '../../js/evo/fitness.js';
import { createLifeCounters } from '../../js/evo/life-counters.js';
import { createObserver, observe } from '../../js/evo/observer.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { nextTick, observed, pushBorn } from './helpers/observer-world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const config = createConfig({ ...FEATURES_OFF, maxAgents: 8, initialAgents: 0, minAgents: 0 });
const { specialisations } = config;

/**
 * An observer and counters with one slot filled in.
 * @param {string} spec specialisation name
 * @param {Record<string, number>} obs observer fields for slot 0
 * @param {Record<string, number>} [life] life counter fields for slot 0
 * @returns {{observer: any, counters: any}}
 */
function slotWith(spec, obs, life = {}) {
    const observer = createObserver(config, fork(createRng(1), 'eval'));
    const counters = createLifeCounters(config);
    observer.spec[0] = specialisations[/** @type {'forager'} */ (spec)].index;
    for (const [k, v] of Object.entries(obs)) {
        observer[k][0] = v;
    }
    for (const [k, v] of Object.entries(life)) {
        counters[k][0] = v;
    }
    return { observer, counters };
}

/** @param {string} spec @param {Record<string, number>} obs @param {Record<string, number>} [life] */
const score = (spec, obs, life) => {
    const { observer, counters } = slotWith(spec, obs, life);
    return fitnessV1(observer, counters, 0, config);
};

describe('fitnessV1 with an unknown specialisation', () => {
    it('adds no spec term', () => {
        const { observer, counters } = slotWith('forager', { foodEnergy: 700 });
        observer.spec[0] = 99;
        expect(fitnessV1(observer, counters, 0, config)).toBe(700);
    });
});

describe('fitnessV1 terms', () => {
    it('names the doc weights', () => {
        expect(FITNESS_V1).toMatchObject({
            OFFSPRING: 300,
            SURVIVAL_RATE: 0.5,
            SURVIVAL_CAP: 30000,
            SPEC_THRESHOLD: 500,
        });
    });

    it('is food plus bite energy below the spec threshold', () => {
        expect(score('forager', { foodEnergy: 400, biteEnergy: 70 })).toBe(470);
    });

    it('pays 300 per child', () => {
        expect(score('scout', { children: 3 })).toBe(900);
    });

    it('pays 0.5 per tick alive, capped at 30000 ticks, only once 500 food energy is eaten', () => {
        expect(score('scout', { ageTicks: 1000 })).toBe(0);
        expect(score('scout', { ageTicks: 1000, foodEnergy: 499 })).toBe(499);
        expect(score('scout', { ageTicks: 1000, foodEnergy: 500 })).toBeCloseTo(500 + 500, 9);
        expect(score('scout', { ageTicks: 90000, foodEnergy: 500 })).toBeCloseTo(500 + 15000, 9);
    });

    it('adds no spec term below 500 food energy, and pays it at 500', () => {
        const base = { kills: 10, children: 0 };
        expect(score('predator', { ...base, foodEnergy: 499 })).toBe(499);
        expect(score('predator', { ...base, foodEnergy: 500 })).toBe(500 + 500);
    });

    it('caps each spec term at foodEnergy', () => {
        expect(score('predator', { foodEnergy: 600, kills: 10 })).toBe(1200);
        expect(score('reproducer', { foodEnergy: 600, children: 6 })).toBe(600 + 1800 + 600);
        expect(score('scout', { foodEnergy: 600 }, { cells300: 400 })).toBe(1200);
        expect(score('defender', { foodEnergy: 600 }, { kinBitesAbsorbed: 5000 })).toBe(1200);
    });

    it('pays the uncapped spec term when it is below foodEnergy', () => {
        expect(score('forager', { foodEnergy: 1000 })).toBe(1000 + 200);
        expect(score('predator', { foodEnergy: 1000, kills: 2 })).toBe(1000 + 300);
        expect(score('reproducer', { foodEnergy: 1000, children: 1 })).toBe(1000 + 300 + 150);
        expect(score('scout', { foodEnergy: 1000 }, { cells300: 30 })).toBe(1000 + 60);
        expect(score('defender', { foodEnergy: 1000 }, { kinBitesAbsorbed: 400 })).toBe(1000 + 200);
    });
});

describe('createFitnessV1', () => {
    it('binds the counters to the evals signature', () => {
        const { observer, counters } = slotWith('scout', { foodEnergy: 1000 }, { cells300: 30 });
        expect(createFitnessV1(counters)(observer, 0, config)).toBe(1060);
    });
});

describe('children in fitness', () => {
    it('counts a split child once and a mated child once per distinct parent', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1 });
        pushBorn(world, { slot: 1, genomeId: 2 });
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 2, genomeId: 3, parentA: 1, parentB: 1, cause: BORN_CAUSE.SPLIT });
        observe(observer, world);
        const counters = createLifeCounters(world.config);
        const fitness = createFitnessV1(counters);
        expect(fitness(observer, 0, world.config)).toBe(300);
        nextTick(world, 2);
        pushBorn(world, { slot: 3, genomeId: 4, parentA: 1, parentB: 2, cause: BORN_CAUSE.MATE });
        observe(observer, world);
        expect([fitness(observer, 0, world.config), fitness(observer, 1, world.config)]).toEqual([600, 300]);
    });
});
