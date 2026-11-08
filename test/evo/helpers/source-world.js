// A scripted world for the metric source tests (docs/designs/metric-trust.md, "Source tests"): the real `createWorld`,
// `step`, `observe` and `checkpoint`, a policy of zero weights, and no food, herds or mating unless a test asks. A test
// plants state in the world between steps (an energy, an age, a bite) and reads `computeMetrics` on the finished run.

import { OUTPUT_COUNT } from '../../../js/sim/brain-layout.js';
import { forwardAll } from '../../../js/sim/brain.js';
import { FOOD_KIND } from '../../../js/sim/carcass.js';
import { createConfig } from '../../../js/sim/config.js';
import { BORN_CAUSE, clearEvents } from '../../../js/sim/events.js';
import { sampleInputActivity } from '../../../js/sim/input-activity.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld, spawnAgent, spawnFoodItem } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { computeMetrics } from '../../../js/evo/metrics.js';
import { checkpoint, createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';

/**
 * The policy: zero weights, a child takes its mother's row, a fixed specialisation.
 * @param {number} [spec] the specialisation index every agent gets (0 is a forager)
 * @returns {any} the policy
 */
export function zeroPolicy(spec = 0) {
    return {
        initSpec: () => spec,
        initBrain() {},
        childBrain(/** @type {any} */ w, /** @type {number} */ child, /** @type {number} */ mother) {
            const n = w.layout.weightCount;
            w.weights.set(w.weights.subarray(mother * n, (mother + 1) * n), child * n);
        },
    };
}

/**
 * @param {{over?: Record<string, any>, runTicks?: number, policy?: any, fitness?: (observer: any, slot: number, config: any) => number}} [options] config overrides, the run length the
 *   observer is told, the policy and the fitness `observe` scores deaths with
 * @returns {{world: any, observer: any, policy: any, want: (slot: number, output: number, value?: number) => void,
 *   release: (slot: number, output: number) => void, spawn: (cause?: number) => number,
 *   tick: (before?: (world: any) => void) => void, jump: (tick: number) => void, check: () => void,
 *   metrics: (options?: Record<string, any>) => Record<string, any>}} the run
 */
export function sourceRun({ over = {}, runTicks = 0, policy = zeroPolicy(), fitness } = {}) {
    const config = createConfig({
        ...SIMPLE_WORLD,
        worldWidth: 1000,
        worldHeight: 1000,
        maxAgents: 16,
        initialAgents: 0,
        minAgents: 0,
        rayCount: 4,
        brainHidden: 3,
        maxFood: 4,
        initialFood: 0,
        foodSpawnRate: 0,
        foodRegrowPerArea: 0,
        maturityTicks: 20,
        ...over,
    });
    const world = createWorld(config, policy);
    const observer = createObserver(config, fork(createRng(config.seed), 'eval'), { runTicks });
    observe(observer, world);
    /** @type {Map<number, number>} */
    const wanted = new Map();
    const phases = {
        ...observerPhases(observer),
        brain(/** @type {any} */ w) {
            for (const [cell, value] of wanted) {
                w.outputs[cell] = value;
            }
        },
    };
    return {
        world,
        observer,
        policy,
        want(slot, output, value = 1) {
            wanted.set(slot * OUTPUT_COUNT + output, value);
        },
        release(slot, output) {
            wanted.delete(slot * OUTPUT_COUNT + output);
            world.outputs[slot * OUTPUT_COUNT + output] = 0;
        },
        spawn(cause = BORN_CAUSE.INITIAL) {
            clearEvents(world.events);
            const slot = spawnAgent(world, policy, cause);
            observe(observer, world);
            return slot;
        },
        tick(before) {
            before?.(world);
            step(world, policy, phases);
            observe(observer, world, fitness);
        },
        jump(tick) {
            world.tick = tick;
        },
        check() {
            checkpoint(observer, world);
        },
        metrics: (options = {}) => computeMetrics(observer, world, options),
    };
}

/**
 * Puts a plant food item of `value` energy on an agent, so the next step's feed phase eats it.
 * @param {any} world the world
 * @param {number} slot the eating agent
 * @param {number} [value] the item's energy (one item is `config.foodEnergy`)
 * @returns {void}
 */
export function plantFood(world, slot, value = world.config.foodEnergy) {
    const food = spawnFoodItem(world);
    world.foodX[food] = world.x[slot];
    world.foodY[food] = world.y[slot];
    world.foodValue[food] = value;
    world.foodTox[food] = 0;
}

/**
 * Empties an agent, so the next step's costs starve it, and sets its age at that death.
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} ageAtDeath the `ageTicks` the death record will hold (the step adds one tick)
 * @returns {void}
 */
export function starve(world, slot, ageAtDeath) {
    world.energy[slot] = 0.0001;
    world.ageTicks[slot] = ageAtDeath - 1;
}

/**
 * Empties an agent that `biter` bit this tick, so the next step reaps it as eaten.
 * @param {any} world the world
 * @param {number} victim the victim's slot
 * @param {number} biter the biter's slot
 * @returns {void}
 */
export function eaten(world, victim, biter) {
    world.energy[victim] = 0.0001;
    world.lastBiter[victim] = world.genomeId[biter];
    world.lastBiteTick[victim] = world.tick;
}

/**
 * Like `sourceRun`, except the step's brain phase runs the real `forwardAll` and `sampleInputActivity` before applying
 * any `want` output overrides, and `checkpointTicks` is forwarded to `createObserver`.
 * @param {{over?: Record<string, any>, runTicks?: number, checkpointTicks?: number, policy?: any, fitness?: (observer: any, slot: number, config: any) => number}} [options]
 *   config overrides, the run length, the checkpoint interval, the policy and the fitness `observe` scores deaths with
 * @returns {{world: any, observer: any, policy: any, want: (slot: number, output: number, value?: number) => void,
 *   release: (slot: number, output: number) => void, spawn: (cause?: number) => number,
 *   tick: (before?: (world: any) => void) => void, jump: (tick: number) => void, check: () => void,
 *   metrics: (options?: Record<string, any>) => Record<string, any>}} the run
 */
export function brainSourceRun({ over = {}, runTicks = 0, checkpointTicks = 0, policy = zeroPolicy(), fitness } = {}) {
    const config = createConfig({
        ...SIMPLE_WORLD,
        worldWidth: 1000,
        worldHeight: 1000,
        maxAgents: 16,
        initialAgents: 0,
        minAgents: 0,
        rayCount: 4,
        brainHidden: 3,
        maxFood: 4,
        initialFood: 0,
        foodSpawnRate: 0,
        foodRegrowPerArea: 0,
        maturityTicks: 20,
        ...over,
    });
    const world = createWorld(config, policy);
    const observer = createObserver(config, fork(createRng(config.seed), 'eval'), { runTicks, checkpointTicks });
    observe(observer, world);
    /** @type {Map<number, number>} */
    const wanted = new Map();
    const phases = {
        ...observerPhases(observer),
        brain(/** @type {any} */ w) {
            forwardAll(w);
            sampleInputActivity(w.inputActivity, w);
            for (const [cell, value] of wanted) {
                w.outputs[cell] = value;
            }
        },
    };
    return {
        world,
        observer,
        policy,
        want(slot, output, value = 1) {
            wanted.set(slot * OUTPUT_COUNT + output, value);
        },
        release(slot, output) {
            wanted.delete(slot * OUTPUT_COUNT + output);
            world.outputs[slot * OUTPUT_COUNT + output] = 0;
        },
        spawn(cause = BORN_CAUSE.INITIAL) {
            clearEvents(world.events);
            const slot = spawnAgent(world, policy, cause);
            observe(observer, world);
            return slot;
        },
        tick(before) {
            before?.(world);
            step(world, policy, phases);
            observe(observer, world, fitness);
        },
        jump(tick) {
            world.tick = tick;
        },
        check() {
            checkpoint(observer, world);
        },
        metrics: (options = {}) => computeMetrics(observer, world, options),
    };
}

/**
 * Puts a meat carcass item of `value` energy on an agent, so the next step's feed phase scavenges it.
 * @param {any} world the world
 * @param {number} slot the eating agent
 * @param {number} [value] the item's energy (one item is `config.foodEnergy`)
 * @returns {void}
 */
export function plantMeat(world, slot, value = world.config.foodEnergy) {
    const food = spawnFoodItem(world);
    world.foodX[food] = world.x[slot];
    world.foodY[food] = world.y[slot];
    world.foodValue[food] = value;
    world.foodTox[food] = 0;
    world.foodKind[food] = FOOD_KIND.MEAT;
}
