// A scripted hunting world for the hunters and intent source tests (docs/designs/metric-trust.md, T16, T17): the real
// `step` on `sourceRun`, a policy whose next spawn takes a chosen specialisation, and a fatal bite planted in one step.
// A kill is deliberate when the hunter's prey tracker reads the prey (the one kill rule, `isDeliberateKill`).

import { OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { sourceRun, zeroPolicy } from './source-world.js';

export const FORAGER = 0;
export const PREDATOR = 1;

/**
 * @param {{runTicks?: number, over?: Record<string, any>}} [options] the run length and config overrides
 * @returns {{run: any, world: any, spawn: (spec: number, cause?: number) => number}} the run, its world, and a spawn of
 *   a chosen specialisation and birth cause
 */
export function huntRun({ runTicks = 0, over = {} } = {}) {
    const next = { spec: FORAGER };
    const policy = { ...zeroPolicy(), initSpec: () => next.spec };
    const run = sourceRun({ runTicks, policy, over: { maxAgents: 32, predatorRestTicks: 0, rayCount: 16, ...over } });
    return {
        run,
        world: run.world,
        spawn(spec, cause = BORN_CAUSE.INITIAL) {
            next.spec = spec;
            const slot = run.spawn(cause);
            next.spec = FORAGER;
            return slot;
        },
    };
}

/**
 * Runs one step at the run's current tick in which `hunter` bites `victim` (energy 1) dead from 30 px away.
 * @param {any} run the run
 * @param {number} hunter the biter's slot
 * @param {number} victim the victim's slot
 * @param {{deliberate?: boolean, age?: number}} [options] whether the prey tracker reads the prey, and the hunter's
 *   `ageTicks` before the step
 * @returns {void}
 */
export function killStep(run, hunter, victim, { deliberate = true, age } = {}) {
    const { world } = run;
    world.x[hunter] = 500;
    world.y[hunter] = 500;
    world.angle[hunter] = 0;
    world.energy[hunter] = 800;
    if (age !== undefined) {
        world.ageTicks[hunter] = age;
    }
    world.x[victim] = 530;
    world.y[victim] = 500;
    world.energy[victim] = 1;
    world.meritPrey.seen[hunter] = world.tick;
    world.meritPrey.bits[hunter] = deliberate ? 0xff : 0;
    world.meritPrey.turn[hunter] = world.tick;
    run.want(hunter, OUTPUT_INDEX.BITE);
    run.tick();
    run.release(hunter, OUTPUT_INDEX.BITE);
}

/**
 * Parks an agent far from the action, so it neither bites nor is bitten.
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} y its row
 * @returns {void}
 */
export function park(world, slot, y) {
    world.x[slot] = 900;
    world.y[slot] = y;
    world.vx[slot] = 0;
    world.vy[slot] = 0;
    world.energy[slot] = 800;
}
