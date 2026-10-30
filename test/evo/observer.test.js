import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { checkpoint, createObserver, observe, observerPhases } from '../../js/evo/observer.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBorn, nextTick, observed } from './helpers/observer-world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

/** A policy that gives random-looking but fixed weights and copies the mother's row into a child. */
const policy = {
    initBrain(/** @type {any} */ w, /** @type {number} */ slot) {
        const n = w.layout.weightCount;
        for (let k = 0; k < n; k++) {
            w.weights[slot * n + k] = Math.sin(slot * 31 + k) * 0.5;
        }
    },
    childBrain(/** @type {any} */ w, /** @type {number} */ child, /** @type {number} */ mother) {
        const n = w.layout.weightCount;
        w.weights.set(w.weights.subarray(mother * n, (mother + 1) * n), child * n);
    },
};

describe('createObserver', () => {
    it('allocates per-slot arrays for maxAgents, zeroed, and keeps the rng', () => {
        const { world, observer } = observed();
        for (const name of observer.slotArrays) {
            expect(observer[name].length, name).toBe(world.config.maxAgents);
        }
        expect(observer.deathCount).toBe(0);
        expect(observer.agentTicks).toBe(0);
        expect(observer.rng).toBeDefined();
        expect(observer.births).toHaveLength(5);
        expect(observer.deathsByCause).toHaveLength(4);
    });

    it('sizes the cell bitset for 200 px cells: 72 x 41 on the default world', () => {
        const observer = createObserver(createConfig({ ...SIMPLE_WORLD }), fork(createRng(1), 'eval'));
        expect([observer.cellCols, observer.cellRows, observer.cellBytes]).toEqual([72, 41, 369]);
    });
});

describe('observe', () => {
    it('handles the initial births at tick 0 without counting a tick', () => {
        const { world, observer } = observed();
        addBorn(world);
        observe(observer, world);
        expect(observer.agentTicks).toBe(0);
        expect(observer.ticks).toBe(0);
        expect(observer.births[BORN_CAUSE.INITIAL]).toBe(1);
    });

    it('sums the population into agentTicks for each observed tick', () => {
        const { world, observer } = observed();
        addBorn(world);
        addBorn(world);
        observe(observer, world);
        nextTick(world, 1);
        observe(observer, world);
        nextTick(world, 2);
        observe(observer, world);
        expect(observer.agentTicks).toBe(4);
        expect(observer.ticks).toBe(2);
    });
});

/** @returns {Readonly<Record<string, any>>} a small busy world's config */
function smallConfig() {
    return createConfig({
        ...SIMPLE_WORLD,
        worldWidth: 2000,
        worldHeight: 1400,
        maxAgents: 40,
        initialAgents: 24,
        minAgents: 12,
        rayCount: 6,
        brainHidden: 4,
        maxFood: 80,
        initialFood: 60,
        fertileZoneMax: 4,
        maxAgeTicks: 120,
        maturityTicks: 20,
        checkInvariants: true,
    });
}

describe('observer on a real world', () => {
    it('counts collisions through observerPhases without changing the world', () => {
        const config = smallConfig();
        const plain = createWorld(config, policy);
        const world = createWorld(config, policy);
        const observer = createObserver(config, fork(createRng(config.seed), 'eval'));
        const overrides = observerPhases(observer);
        observe(observer, world);
        let collided = 0;
        for (let t = 0; t < 400; t++) {
            step(plain, policy);
            step(world, policy, overrides);
            observe(observer, world);
            collided += observer.collisions.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
        }
        expect(hashWorld(world)).toBe(hashWorld(plain));
        expect(collided).toBeGreaterThan(0);
    });

    it('keeps its totals consistent with the world over a few hundred ticks', () => {
        const config = smallConfig();
        const world = createWorld(config, policy);
        const observer = createObserver(config, fork(createRng(config.seed), 'eval'));
        observe(observer, world, () => 1);
        let populationSum = 0;
        for (let t = 0; t < 400; t++) {
            step(world, policy);
            observe(observer, world, () => 1);
            populationSum += world.population;
            if (world.tick % 100 === 0) {
                checkpoint(observer, world);
            }
        }
        const born = observer.births.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
        const died = observer.deathsByCause.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
        expect(observer.agentTicks).toBe(populationSum);
        expect(observer.ticks).toBe(400);
        expect(born - died).toBe(world.population);
        expect(observer.deathCount).toBe(died);
        expect(observer.slotOf.size).toBe(world.population);
        expect(died).toBeGreaterThan(20);
        expect(observer.checkpointCount).toBe(4);
        expect(observer.series.population[3]).toBe(world.population);
        for (let slot = 0; slot < config.maxAgents; slot++) {
            if (world.alive[slot] === 1) {
                expect(observer.genomeId[slot]).toBe(world.genomeId[slot]);
                expect(observer.ageTicks[slot]).toBe(world.ageTicks[slot]);
            }
        }
        const foodDead = Array.from(observer.deaths.foodEnergy.subarray(0, died)).reduce((a, b) => a + b, 0);
        expect(observer.foodEnergyDead).toBeCloseTo(foodDead, 6);
        expect(observer.deaths.fitness.subarray(0, died).every((/** @type {number} */ f) => f === 1)).toBe(true);
    });
});
