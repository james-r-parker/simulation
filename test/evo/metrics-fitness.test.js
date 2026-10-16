import { describe, expect, it } from 'vitest';
import { fitnessBySpec, fitnessMetrics } from '../../js/evo/metrics-fitness.js';
import { addAlive, addDeath, bareObserver } from './helpers/metrics-observer.js';

const fitness = (/** @type {any} */ o, /** @type {number} */ slot) => o.foodEnergy[slot];

describe('fitnessMetrics', () => {
    it('pools the death log and the living, per spec', () => {
        const o = bareObserver();
        addDeath(o, { spec: 0, fitness: 1 });
        addDeath(o, { spec: 0, fitness: 3 });
        addDeath(o, { spec: 1, fitness: 10 });
        addAlive(o, 2, { spec: 0, foodEnergy: 5 });
        expect(fitnessBySpec(o, fitness)).toEqual([[1, 3, 5], [10]]);
        const m = fitnessMetrics(o, fitness);
        expect(m['eval.mean_fitness.forager'].value).toBe(3);
        expect(m['eval.p90_fitness.forager'].value).toBeCloseTo(4.6, 12);
        expect(m['eval.p90_fitness.predator'].value).toBe(10);
    });

    it('is null per spec with no agents, naming the spec', () => {
        const m = fitnessMetrics(bareObserver(), fitness);
        expect(m['eval.p90_fitness.scout']).toEqual({ value: null, reason: 'no agents of scout' });
        expect(Object.keys(m)).toHaveLength(10);
    });

    it('is null with reason "no fitness" when no fitness function is given', () => {
        const o = bareObserver();
        addDeath(o, { spec: 0, fitness: 1 });
        const m = fitnessMetrics(o, undefined);
        expect(m['eval.mean_fitness.forager']).toEqual({ value: null, reason: 'no fitness' });
    });

    it('skips NaN death fitness', () => {
        const o = bareObserver();
        addDeath(o, { spec: 2 });
        expect(fitnessMetrics(o, fitness)['eval.mean_fitness.reproducer'].value).toBeNull();
    });
});
