import { computeMetrics } from '../../../js/evo/metrics.js';
import { checkpoint, observe } from '../../../js/evo/observer.js';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { nextTick, observed, pushBorn, pushDied } from './observer-world.js';

export const { INITIAL, MATE, SPLIT, FLOOR, IMMIGRANT } = BORN_CAUSE;

/** The first tick counted by the after-burn-in metrics (`BURN_IN_TICKS`). */
export const B = 10000;

/** A fitness that is the food energy the agent ate: the death record's `foodEnergy`. */
export const foodFitness = (/** @type {any} */ o, /** @type {number} */ slot) => o.foodEnergy[slot];

/**
 * An event-driven run for the selection audits: a 64-slot world and its observer, fed only by the events the test
 * pushes through the real `observe`. `at(tick, fn)` moves the clock so a record pushed with the helpers carries event
 * tick `tick`, runs `fn(world)`, then observes.
 * @param {{fitness?: typeof foodFitness, over?: Record<string, any>}} [options] the policy fitness and config overrides
 * @returns {{world: any, observer: any, at: (tick: number, fn: (world: any) => void) => void,
 *   check: (tick: number) => void, metrics: (options?: Record<string, any>) => Record<string, any>}}
 */
export function selectionRun({ fitness, over = {} } = {}) {
    const { world, observer } = observed({ maturityTicks: 20, maxAgents: 64, ...over });
    observe(observer, world);
    return {
        world,
        observer,
        at(tick, fn) {
            nextTick(world, tick + 1);
            fn(world);
            observe(observer, world, fitness);
        },
        check(tick) {
            world.tick = tick;
            checkpoint(observer, world);
        },
        metrics: (options = {}) => computeMetrics(observer, world, options),
    };
}

/**
 * Pushes an `AgentBorn` at the current event tick.
 * @param {any} world the world
 * @param {number} slot the slot
 * @param {number} id the genome id
 * @param {number} cause a `BORN_CAUSE`
 * @param {number[]} [parents] the genome ids of parent A and parent B (a split names one twice)
 * @returns {void}
 */
export function born(world, slot, id, cause, parents = [0, 0]) {
    pushBorn(world, { slot, genomeId: id, cause, parentA: parents[0], parentB: parents[1] });
}

/**
 * Pushes an `AgentDied`.
 * @param {any} world the world
 * @param {number} slot the slot
 * @param {number} id the genome id
 * @param {number} ageTicks the life's length in ticks
 * @param {number} [foodEnergy] the food energy eaten
 * @returns {void}
 */
export function died(world, slot, id, ageTicks, foodEnergy = 0) {
    pushDied(world, { slot, genomeId: id, ageTicks, foodEnergy });
}
