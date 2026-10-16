// Eval worker: runs one seed of one policy for N ticks and returns its metrics (see `scripts/eval.mjs`).
import { isMainThread } from 'node:worker_threads';
import { computeMetrics } from '../js/evo/metrics.js';
import { checkpoint, createObserver, observe, observerPhases } from '../js/evo/observer.js';
import { getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { EVENT_STRIDE, readEvents } from '../js/sim/events.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { hashWorld } from '../js/sim/world-hash.js';
import { serveTasks } from './lib/worker-pool.mjs';

const CHECKPOINT_INTERVAL = 1000;

/**
 * @typedef {object} EvalTask
 * @property {number} seed the world seed
 * @property {number} ticks ticks to run
 * @property {string} policy a key of `POLICIES`
 * @property {Record<string, any>} overrides config overrides (the `--config` object, or `{}`)
 */

/**
 * Gives the policy each event record of the tick: `onEvent(world, offset)`, where `offset` is the record's start
 * index in `world.events.data` (`offset + 0` is the type, `offset + 1` the tick).
 * @param {Record<string, any>} policy the policy
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function dispatchEvents(policy, world) {
    if (policy.onEvent === undefined) {
        return;
    }
    const count = readEvents(world.events);
    for (let i = 0; i < count; i++) {
        policy.onEvent(world, i * EVENT_STRIDE);
    }
}

/**
 * @param {ArrayLike<number>} values numbers
 * @returns {number} their sum
 */
function sum(values) {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
        total += values[i];
    }
    return total;
}

/**
 * Steps and observes the world, returning the checkpoint series.
 * @param {EvalTask} task the task
 * @param {Record<string, any>} run the policy, observer and world
 * @returns {{tick: number, population: number, births: number, deaths: number}[]} one entry per checkpoint
 */
function runTicks({ ticks }, { policy, observer, world }) {
    const phases = observerPhases(observer);
    const checkpoints = [];
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        observe(observer, world, policy.fitness);
        dispatchEvents(policy, world);
        policy.afterStep?.(world);
        if (world.tick % CHECKPOINT_INTERVAL === 0 && world.tick >= CHECKPOINT_INTERVAL) {
            checkpoint(observer, world);
            checkpoints.push({
                tick: world.tick,
                population: world.population,
                births: sum(observer.births),
                deaths: sum(observer.deathsByCause),
            });
        }
    }
    return checkpoints;
}

/**
 * Runs one seed.
 * @param {EvalTask} task the task
 * @returns {Record<string, any>} `{ seed, metrics, worldHash, wallMs, fitnessName, checkpoints }`
 * @throws {Error} naming the seed and the tick at which a step failed
 */
export function runSeed(task) {
    const { seed, policy: policyName, overrides } = task;
    const started = performance.now();
    const config = createConfig({ ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(policyName).create({ config, log, observer });
    /** @type {Record<string, any> | undefined} */
    let world;
    let checkpoints;
    try {
        world = createWorld(config, policy.brain);
        observe(observer, world, policy.fitness);
        checkpoints = runTicks(task, { policy, observer, world });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed} failed at tick ${world?.tick ?? 0}: ${message}`, { cause: error });
    }
    const metrics = computeMetrics(observer, world, { fitness: policy.fitness, fitnessName: policy.fitnessName });
    return {
        seed,
        metrics,
        worldHash: hashWorld(world),
        wallMs: performance.now() - started,
        fitnessName: policy.fitnessName,
        checkpoints,
    };
}

if (!isMainThread) {
    serveTasks(runSeed);
}
