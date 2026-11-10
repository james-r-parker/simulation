// A scripted hunting world for the hunters and intent source tests (docs/designs/metric-trust.md, T16, T17): the real
// `step` on `sourceRun`, a policy whose next spawn takes a chosen specialisation, and a fatal bite planted in one step.
// A kill is deliberate when the hunter's prey tracker reads the prey (the one kill rule, `isDeliberateKill`).

import { OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE, clearEvents } from '../../../js/sim/events.js';
import { spawnAgent } from '../../../js/sim/spawn.js';
import { observe } from '../../../js/evo/observer.js';
import { sourceRun, zeroPolicy } from './source-world.js';

export const FORAGER = 0;
export const PREDATOR = 1;

/**
 * @param {{runTicks?: number, over?: Record<string, any>}} [options] the run length and config overrides
 * @returns {{run: any, world: any, spawn: (spec: number, cause?: number, lineage?: number) => number}} the run, its
 *   world, and a spawn of a chosen specialisation, birth cause and (before the observer sees the birth) lineage
 */
export function huntRun({ runTicks = 0, over = {} } = {}) {
    const next = { spec: FORAGER };
    const policy = { ...zeroPolicy(), initSpec: () => next.spec };
    const run = sourceRun({ runTicks, policy, over: { maxAgents: 32, predatorRestTicks: 0, rayCount: 16, ...over } });
    return {
        run,
        world: run.world,
        spawn(spec, cause = BORN_CAUSE.INITIAL, lineage = undefined) {
            next.spec = spec;
            const { world } = run;
            clearEvents(world.events);
            const slot = spawnAgent(world, policy, cause);
            if (lineage !== undefined) {
                setBornLineage(world, slot, lineage);
            }
            observe(run.observer, world);
            next.spec = FORAGER;
            return slot;
        },
    };
}

/**
 * Gives a newborn a lineage in the world and in its `AgentBorn` record, before the observer reads the birth.
 * @param {any} world the world
 * @param {number} slot the newborn
 * @param {number} lineage the lineage id
 * @returns {void}
 */
function setBornLineage(world, slot, lineage) {
    world.lineageId[slot] = lineage;
    const { data, count } = world.events;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (data[o] === EVENT_TYPE.AGENT_BORN && data[o + 2] === slot) {
            data[o + 4] = lineage;
        }
    }
}

/**
 * Runs one step at the run's current tick in which `hunter` bites `victim` from 30 px away, clear of the wall at x 500.
 * @param {any} run the run
 * @param {number} hunter the biter's slot
 * @param {number} victim the victim's slot
 * @param {{deliberate?: boolean, age?: number, victimEnergy?: number}} [options] whether the prey tracker reads the
 *   prey, the hunter's `ageTicks` before the step, and the victim's energy (1 is a fatal bite; the default 800 is not)
 * @returns {void}
 */
export function biteStep(run, hunter, victim, { deliberate = true, age, victimEnergy = 800 } = {}) {
    const { world } = run;
    world.x[hunter] = 200;
    world.y[hunter] = 500;
    world.angle[hunter] = 0;
    world.energy[hunter] = 800;
    if (age !== undefined) {
        world.ageTicks[hunter] = age;
    }
    world.x[victim] = 230;
    world.y[victim] = 500;
    world.energy[victim] = victimEnergy;
    world.meritPrey.seen[hunter] = world.tick;
    world.meritPrey.bits[hunter] = deliberate ? 0xff : 0;
    world.meritPrey.turn[hunter] = world.tick;
    run.want(hunter, OUTPUT_INDEX.BITE);
    run.tick();
    run.release(hunter, OUTPUT_INDEX.BITE);
}

/**
 * Runs one step in which `hunter` bites `victim` (energy 1) dead.
 * @param {any} run the run
 * @param {number} hunter the biter's slot
 * @param {number} victim the victim's slot
 * @param {{deliberate?: boolean, age?: number}} [options] as `biteStep`
 * @returns {void}
 */
export function killStep(run, hunter, victim, options = {}) {
    biteStep(run, hunter, victim, { ...options, victimEnergy: 1 });
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

/** Ticks a chase thrusts toward visible prey before its outcome: more than `CLOSING_MIN` closing ticks open it. */
export const CHASE_CLOSING_TICKS = 12;

/**
 * Runs one chase on row `y`: `hunter` at x 100 thrusts toward `prey` at x 260 (in view, held still) for
 * `CHASE_CLOSING_TICKS` steps, which opens an approach on the observer's own tracker. Then, for `caught` or `escaped`,
 * it is set beside the prey and bites it (energy 1, or 800 so it lives); for `gaveup` it stops. Afterwards the hunter
 * faces away and the prey is parked out of sight.
 * @param {any} run the run
 * @param {{hunter: number, prey: number, outcome: 'caught' | 'escaped' | 'gaveup', y?: number, energy?: number,
 *   age?: number}} chase the pair, the outcome, the row, the hunter's energy at the opening (default 300; it bites at 300,
 *   so a full hunter can still strike) and its `ageTicks` at the start
 * @returns {void}
 */
export function chaseSteps(run, { hunter, prey, outcome, y = 500, energy = 300, age }) {
    const { world } = run;
    const preyEnergy = outcome === 'caught' ? 1 : 800;
    const hold = (/** @type {number} */ slot, /** @type {number} */ x, /** @type {number} */ angle) => {
        world.x[slot] = x;
        world.y[slot] = y;
        world.vx[slot] = 0;
        world.vy[slot] = 0;
        world.angle[slot] = angle;
    };
    hold(hunter, 100, 0);
    world.energy[hunter] = energy;
    if (age !== undefined) {
        world.ageTicks[hunter] = age;
    }
    run.want(hunter, OUTPUT_INDEX.THRUST);
    for (let t = 0; t < CHASE_CLOSING_TICKS; t++) {
        hold(prey, 260, Math.PI);
        world.energy[prey] = preyEnergy;
        run.tick();
    }
    run.release(hunter, OUTPUT_INDEX.THRUST);
    if (outcome !== 'gaveup') {
        hold(hunter, 230, 0);
        world.energy[hunter] = 300;
        world.meritPrey.seen[hunter] = world.tick;
        world.meritPrey.bits[hunter] = 0xff;
        world.meritPrey.turn[hunter] = world.tick;
        run.want(hunter, OUTPUT_INDEX.BITE);
        run.tick();
        run.release(hunter, OUTPUT_INDEX.BITE);
    }
    hold(hunter, 100, Math.PI);
    if (world.alive[prey] === 1) {
        park(world, prey, y);
    }
}

/**
 * Steps until every open approach and bitten episode has resolved: the closing bits fade over about 5 ticks, then a
 * lapse needs more than `INTENT_WINDOW` (30) ticks without a closing one.
 * @param {any} run the run
 * @returns {void}
 */
export function settleChases(run) {
    for (let t = 0; t < 45; t++) {
        run.tick();
    }
}
