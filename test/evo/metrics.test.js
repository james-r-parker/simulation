import { describe, expect, it } from 'vitest';
import { createArchive, offer } from '../../js/evo/archive.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { checkpoint, createObserver, observe, observerPhases } from '../../js/evo/observer.js';
import { fitnessV5 } from '../../js/evo/fitness-v5.js';
import { createConfig } from '../../js/sim/config.js';
import { BORN_CAUSE, DEATH_CAUSE } from '../../js/sim/events.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { addAlive, addCheckpoint, addDeath, bareObserver } from './helpers/metrics-observer.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const fitness = (/** @type {any} */ o, /** @type {number} */ slot) => o.children[slot];

describe('computeMetrics on hand-built state', () => {
    it('is null with reasons on an empty observer, and 0 floor episodes', () => {
        const m = computeMetrics(bareObserver(), {}, { fitness });
        expect(m['eval.food_energy_per_1k']).toEqual({ value: null, reason: 'no agent-ticks' });
        expect(m['eval.median_lifespan']).toEqual({ value: null, reason: 'no mature death' });
        expect(m['eval.fed_median_lifespan']).toEqual({ value: null, reason: 'no mature death after a meal' });
        expect(m['eval.floor_episodes']).toEqual({ value: 0 });
        expect(m['eval.behaviour_coverage'].reason).toBe('no sampled mature death');
        expect(m['eval.qd_score']).toEqual({ value: null, reason: 'no archive' });
        expect(m['eval.coverage']).toEqual({ value: null, reason: 'no archive' });
        expect(m['eval.champion_elo']).toEqual({ value: null, reason: 'no league games' });
        expect(m['eval.champion_win_rate']).toEqual({ value: null, reason: 'no league games' });
    });

    it('reads eval.qd_score and eval.coverage from the policy archive', () => {
        const layout = brainLayout({ rayCount: 2, brainHidden: 4 });
        const archive = createArchive(layout);
        const item = { spec: 0, cell: 5, row: new Float32Array(layout.weightCount), sigma: 0.1, id: 1, fitness: 100 };
        offer(archive, item);
        offer(archive, { ...item, cell: 6, id: 2 });
        const m = computeMetrics(bareObserver(), {}, { archive });
        expect(m['eval.coverage']).toEqual({ value: 2 / 500 });
        expect(m['eval.qd_score']).toEqual({ value: 200 / 500 });
    });

    it('has a fixed sorted key order', () => {
        const keys = Object.keys(computeMetrics(bareObserver(), {}));
        expect(keys).toEqual([...keys].sort());
        expect(keys).toHaveLength(16 + 10 + 4 + 5 + 15 + 6 + 4 + 4 + 3 + 4 + 2 + 4 + 5 + 3 + 5 + 13);
    });

    it('reads the per-1k metrics from totals, the dead and the living', () => {
        const o = bareObserver();
        o.agentTicks = 2000;
        o.foodEnergyDead = 30;
        o.births[BORN_CAUSE.MATE] = 3;
        o.births[BORN_CAUSE.SPLIT] = 1;
        o.births[BORN_CAUSE.FLOOR] = 50;
        o.deathsByCause[DEATH_CAUSE.EATEN] = 6;
        o.floorEpisodes = 2;
        addAlive(o, 0, { foodEnergy: 10 });
        const m = computeMetrics(o, {});
        expect(m['eval.food_energy_per_1k'].value).toBe(20);
        expect(m['eval.births_per_1k'].value).toBe(2);
        expect(m['eval.predation_per_1k'].value).toBe(3);
        expect(m['eval.floor_episodes'].value).toBe(2);
    });

    it('is null with a reason for eval.born_share when no agent entered after burn-in', () => {
        const o = bareObserver();
        o.birthsAfterBurnIn[BORN_CAUSE.MATE] = 0;
        o.births[BORN_CAUSE.INITIAL] = 100;
        expect(computeMetrics(o, {})['eval.born_share']).toEqual({
            value: null,
            reason: 'no agent entered after burn-in',
        });
    });

    it('reads eval.born_share as mating and split entries over all entries after burn-in', () => {
        const o = bareObserver();
        o.birthsAfterBurnIn[BORN_CAUSE.MATE] = 3;
        o.birthsAfterBurnIn[BORN_CAUSE.SPLIT] = 1;
        o.birthsAfterBurnIn[BORN_CAUSE.FLOOR] = 4;
        o.birthsAfterBurnIn[BORN_CAUSE.IMMIGRANT] = 0;
        o.births[BORN_CAUSE.INITIAL] = 100;
        o.births[BORN_CAUSE.MATE] = 40;
        expect(computeMetrics(o, {})['eval.born_share']).toEqual({ value: 0.5 });
    });

    it('reads eval.mating_share as mating births over mating and split births, over the whole run', () => {
        const o = bareObserver();
        o.births[BORN_CAUSE.MATE] = 3;
        o.births[BORN_CAUSE.SPLIT] = 9;
        o.births[BORN_CAUSE.FLOOR] = 50;
        expect(computeMetrics(o, {})['eval.mating_share']).toEqual({ value: 0.25 });
    });

    it('is null with a reason for eval.mating_share when nothing was born by mating or split', () => {
        const o = bareObserver();
        o.births[BORN_CAUSE.INITIAL] = 100;
        expect(computeMetrics(o, {})['eval.mating_share']).toEqual({
            value: null,
            reason: 'no mating or split birth',
        });
    });

    it('takes the median lifespan over mature deaths only, averaging the middle pair', () => {
        const o = bareObserver();
        for (const ageTicks of [5, 20, 40, 100, 1000]) {
            addDeath(o, { ageTicks });
        }
        expect(computeMetrics(o, {})['eval.median_lifespan'].value).toBe(70);
    });

    it('takes the fed median lifespan over mature deaths that ate at least one food item', () => {
        const o = bareObserver();
        const meal = o.config.foodEnergy;
        addDeath(o, { ageTicks: 5000, foodEnergy: 0 });
        addDeath(o, { ageTicks: 4000, foodEnergy: meal - 1 });
        addDeath(o, { ageTicks: 10, foodEnergy: meal * 3 });
        addDeath(o, { ageTicks: 300, foodEnergy: meal });
        addDeath(o, { ageTicks: 500, foodEnergy: meal * 2 });
        expect(computeMetrics(o, {})['eval.fed_median_lifespan'].value).toBe(400);
        expect(computeMetrics(o, {})['eval.median_lifespan'].value).toBe(2250);
    });

    it('combines series, grid and fitness metrics', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 1000, population: 4, predatorShare: 0.25, diversity: 1 });
        addDeath(o, { ageTicks: 100, samples: 1, spec: 0, fitness: 2 });
        addAlive(o, 1, { spec: 0, children: 4 });
        const m = computeMetrics(o, {}, { fitness });
        expect(m['eval.population_mean'].value).toBe(4);
        expect(m['eval.spec_turnover'].reason).toBe('no checkpoint after burn-in');
        expect(m['eval.predator_share_cv'].value).toBe(0);
        expect(m['eval.behaviour_coverage'].value).toBe(0.01);
        expect(m['eval.mean_fitness.forager'].value).toBe(3);
        expect(m['eval.mean_fitness.defender'].reason).toBe('no agents of defender');
        expect(computeMetrics(o, {})['eval.mean_fitness.forager'].reason).toBe('no fitness');
    });

    it('is deterministic for the same state and rng state', () => {
        const make = () => {
            const o = bareObserver();
            o.rng = fork(createRng(9), 'eval');
            for (let i = 0; i < 400; i++) {
                addDeath(o, { ageTicks: 50, samples: 2, speedSum: (i % 7) / 7, turnSum: (i % 5) / 5, children: i % 3 });
            }
            return o;
        };
        expect(computeMetrics(make(), {})).toEqual(computeMetrics(make(), {}));
    });
});

describe('computeMetrics on a real world', () => {
    it('gives every metric a finite number or null with a reason', () => {
        const config = createConfig({
            ...FEATURES_OFF,
            worldWidth: 2000,
            worldHeight: 1400,
            maxAgents: 40,
            initialAgents: 24,
            minAgents: 12,
            rayCount: 6,
            brainHidden: 4,
            maxFood: 80,
            initialFood: 60,
            obstacleCount: 2,
            obstacleMinRadius: 20,
            obstacleMaxRadius: 60,
            fertileZoneMax: 4,
            maxAgeTicks: 300,
            maturityTicks: 20,
        });
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
        const world = createWorld(config, policy);
        const observer = createObserver(config, fork(createRng(config.seed), 'eval'));
        const overrides = observerPhases(observer);
        observe(observer, world, fitnessV5);
        for (let t = 0; t < 2000; t++) {
            step(world, policy, overrides);
            observe(observer, world, fitnessV5);
            if (world.tick % 1000 === 0) {
                checkpoint(observer, world);
            }
        }
        const metrics = computeMetrics(observer, world, { fitness: fitnessV5, fitnessName: 'fitness-v5' });
        expect(observer.deathCount).toBeGreaterThan(0);
        for (const [name, result] of Object.entries(metrics)) {
            if (result.value === null) {
                expect(result.reason, name).toBeTypeOf('string');
            } else {
                expect(Number.isFinite(result.value), name).toBe(true);
            }
        }
        expect(metrics['eval.food_energy_per_1k'].value).not.toBeNull();
        expect(metrics['eval.population_mean'].value).toBeGreaterThan(0);
        expect(metrics['eval.mean_fitness.forager'].value).not.toBeNull();
    });
});
