// The strike miss energy share in a real world (docs/designs/metric-trust.md, "Source tests"): the real `step` and
// `observe` run a hunter that holds BITE with nothing in its jaws, and the observer's count is held against the energy the
// sim itself removed (`ledgerBiteCost`, which holds a miss's `removeEnergy` result and a landed bite's kick).
//
// The off-by-one the scene depends on: `feed` stamps `jawsStamp` with `world.tick + 1` during the step, and `step` then
// raises `world.tick`, so the observer, which reads after the step, finds `jawsStamp === world.tick` for a hunter that had
// a body in its jaws. The first test pins both sides of it.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { plantMeat } from './helpers/source-world.js';
import { FORAGER, PREDATOR, huntRun, park } from './helpers/hunt-scene.js';

const COST = 2;
const OVER = { maturityTicks: 100000, strikeMissCost: COST };

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {[number, number, number]} pose x, y and energy
 * @returns {void}
 */
function pose(world, slot, [x, y, energy]) {
    world.x[slot] = x;
    world.y[slot] = y;
    world.vx[slot] = 0;
    world.vy[slot] = 0;
    world.angle[slot] = 0;
    world.energy[slot] = energy;
    world.size[slot] = world.config.baseSize + energy / world.config.energyToSize;
}

describe('the jaws stamp the observer reads after the step', () => {
    it('equals the tick the observer sees for a hunter with a body in its jaws, and differs for one with none', () => {
        const { run, world, spawn } = huntRun({ over: OVER });
        const hunter = spawn(PREDATOR);
        const body = spawn(FORAGER);
        run.want(hunter, OUTPUT_INDEX.BITE);
        pose(world, hunter, [200, 500, 300]);
        pose(world, body, [225, 500, 300]);
        run.tick();
        expect(world.jawsStamp[hunter]).toBe(world.tick);
        expect(run.observer.scenes.strikeMiss.misses).toBe(0);
        park(world, body, 100);
        run.tick();
        expect(world.jawsStamp[hunter]).toBe(world.tick - 1);
        expect(run.observer.scenes.strikeMiss.misses).toBe(1);
    });
});

describe('eval.strike_miss_energy_share in a real world', () => {
    it('counts each idle strike once and equals the energy the sim charged for them', () => {
        const { run, world, spawn } = huntRun({ over: OVER });
        const hunter = spawn(PREDATOR);
        const body = spawn(FORAGER);
        run.want(hunter, OUTPUT_INDEX.BITE);
        for (let t = 0; t < 6; t++) {
            pose(world, hunter, [200, 500, 300]);
            pose(world, body, [225, 500, 300]);
            run.tick();
        }
        expect(run.observer.scenes.strikeMiss.misses).toBe(0);
        const before = world.ledgerBiteCost[hunter];
        for (let t = 0; t < 10; t++) {
            pose(world, hunter, [200, 500, 300]);
            park(world, body, 100);
            run.tick();
        }
        expect(run.observer.scenes.strikeMiss.misses).toBe(10);
        expect(world.ledgerBiteCost[hunter] - before).toBeCloseTo(10 * COST, 9);
    });

    it('divides the priced misses by the energy the hunters stored', () => {
        const { run, world, spawn } = huntRun({ over: OVER });
        const hunter = spawn(PREDATOR);
        run.want(hunter, OUTPUT_INDEX.BITE);
        for (let t = 0; t < 10; t++) {
            pose(world, hunter, [200, 500, 300]);
            if (t === 0) {
                plantMeat(world, hunter, 50);
            }
            run.tick();
        }
        expect(world.ledgerCarcass[hunter]).toBe(50);
        expect(run.metrics()['eval.strike_miss_energy_share']).toEqual({ value: (10 * COST) / 50 });
    });

    it('is null with no hunter income, and 0 with strikeMissCost 0', () => {
        const idle = huntRun({ over: OVER });
        const hunter = idle.spawn(PREDATOR);
        idle.run.want(hunter, OUTPUT_INDEX.BITE);
        idle.run.tick();
        expect(idle.run.metrics()['eval.strike_miss_energy_share']?.value).toBeNull();
        const free = huntRun({ over: { ...OVER, strikeMissCost: 0 } });
        const freeHunter = free.spawn(PREDATOR);
        free.run.want(freeHunter, OUTPUT_INDEX.BITE);
        pose(free.world, freeHunter, [200, 500, 300]);
        plantMeat(free.world, freeHunter, 50);
        free.run.tick();
        expect(free.run.metrics()['eval.strike_miss_energy_share']).toEqual({ value: 0 });
    });
});
