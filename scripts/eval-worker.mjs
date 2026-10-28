// Eval worker: runs one seed of one policy for N ticks and returns its metrics (see `scripts/eval.mjs`).
import { isMainThread } from 'node:worker_threads';
import { computeMetrics } from '../js/evo/metrics.js';
import { checkpoint, createObserver, observerPhases } from '../js/evo/observer.js';
import { createTrace, finishTrace, observeTrace } from '../js/evo/trace.js';
import { getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { hashWorld } from '../js/sim/world-hash.js';
import { feedPolicy } from './lib/feed-policy.mjs';
import { serveTasks } from './lib/worker-pool.mjs';

export { dispatchEvents } from './lib/feed-policy.mjs';

const CHECKPOINT_INTERVAL = 1000;

/**
 * @typedef {object} EvalTask
 * @property {number} seed the world seed
 * @property {number} ticks ticks to run
 * @property {string} policy a key of `POLICIES`
 * @property {Record<string, any>} overrides config overrides (the `--config` object, or `{}`)
 * @property {Record<string, any>} [policyOptions] options for the policy (`validatePolicyOptions`), default none
 * @property {number} [traceInterval] ticks between the trace's population samples, default 1000
 */

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
function runTicks({ ticks }, { policy, observer, world, trace }) {
    const phases = observerPhases(observer);
    const checkpoints = [];
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        feedPolicy({ policy, observer }, world);
        observeTrace(trace, world, observer);
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
    const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: task.ticks });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(policyName).create({ config, log, observer, ...task.policyOptions });
    /** @type {Record<string, any> | undefined} */
    let world;
    let checkpoints;
    const trace = createTrace({ ticks: task.ticks, interval: task.traceInterval });
    try {
        world = createWorld(config, policy.brain);
        feedPolicy({ policy, observer }, world);
        checkpoints = runTicks(task, { policy, observer, world, trace });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed} failed at tick ${world?.tick ?? 0}: ${message}`, { cause: error });
    }
    const metrics = computeMetrics(observer, world, {
        fitness: policy.fitness,
        fitnessName: policy.fitnessName,
        archive: policy.archive,
    });
    return {
        seed,
        metrics,
        worldHash: hashWorld(world),
        wallMs: performance.now() - started,
        fitnessName: policy.fitnessName,
        checkpoints,
        trace: finishTrace(trace, world, observer),
    };
}

if (!isMainThread) {
    serveTasks(runSeed);
}
