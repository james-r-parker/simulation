import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { checkpoint, createObserver } from '../../js/evo/observer.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { plainBrain } from '../../js/evo/plain-brain.js';
import { createWorld } from '../../js/sim/spawn.js';
import { EARLY_TICKS, foodEnergyEarly } from '../../js/evo/metrics-food-early.js';
import { addAlive, addCheckpoint, bareObserver, EMPTY_WORLD } from './helpers/metrics-observer.js';

const NAME = 'eval.food_energy_per_1k@20k';

describe('eval.food_energy_per_1k@20k', () => {
    it('is null with a reason when no checkpoint was taken', () => {
        expect(foodEnergyEarly(bareObserver())).toEqual({ value: null, reason: 'no checkpoint at tick 20000' });
    });

    it('is null for a run shorter than 20000 ticks, whose last checkpoint is the whole run (D5)', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 6000, foodEnergyTotal: 600, agentTicksTotal: 1000 });
        expect(foodEnergyEarly(o)).toEqual({ value: null, reason: 'no checkpoint at tick 20000' });
    });

    it('is null with a reason when the first checkpoint is after the window', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: EARLY_TICKS + 100, foodEnergyTotal: 50, agentTicksTotal: 1000 });
        expect(foodEnergyEarly(o).value).toBeNull();
    });

    it('is null with a reason when the checkpoint holds no agent-ticks', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: EARLY_TICKS });
        expect(foodEnergyEarly(o)).toEqual({ value: null, reason: 'no agent-ticks' });
    });

    it('reads the checkpoint at 20000 and ignores earlier and later ones', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 10000, foodEnergyTotal: 10, agentTicksTotal: 1000 });
        addCheckpoint(o, { tick: EARLY_TICKS, foodEnergyTotal: 60, agentTicksTotal: 3000 });
        addCheckpoint(o, { tick: 30000, foodEnergyTotal: 9000, agentTicksTotal: 6000 });
        expect(foodEnergyEarly(o)).toEqual({ value: 20 });
        o.agentTicks = 6000;
        expect(computeMetrics(o, EMPTY_WORLD)[NAME]).toEqual({ value: 20 });
    });

    it('is recorded by the checkpoint from the dead and the living', () => {
        const config = createConfig({ seed: 3 });
        const o = createObserver(config, fork(createRng(3), 'eval'));
        const world = createWorld(config, plainBrain);
        o.agentTicks = 400;
        o.foodEnergyDead = 30;
        addAlive(o, 0, { foodEnergy: 10 });
        checkpoint(o, world);
        expect(o.series.foodEnergyTotal[0]).toBe(40);
        expect(o.series.agentTicksTotal[0]).toBe(400);
    });
});
