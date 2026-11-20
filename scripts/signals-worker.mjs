// Signals worker: runs one seed of a policy with the signal census attached and returns its rows (see
// `scripts/audit-signals.mjs`). The census only reads the world; the run is the eval's own.
import { isMainThread } from 'node:worker_threads';
import { createObserver, observerPhases } from '../js/evo/observer.js';
import { getPolicy } from '../js/evo/policies/index.js';
import { createCensus, inputRows, noteCensusTick, outputRows } from '../js/evo/signal-census.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { feedPolicy } from './lib/feed-policy.mjs';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} SignalsTask
 * @property {number} seed the world seed
 * @property {number} ticks ticks to run
 * @property {string} policy a key of `POLICIES`
 * @property {Record<string, any>} overrides config overrides
 */

/**
 * @param {SignalsTask} task the task
 * @returns {{seed: number, samples: number, inputs: import('../js/evo/signal-census.js').InputRow[], outputs: import('../js/evo/signal-census.js').OutputRow[]}}
 *   the census rows of the seed
 * @throws {Error} naming the seed and the tick at which a step failed
 */
export function runSignals({ seed, ticks, policy: policyName, overrides }) {
    const config = createConfig({ ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'signal-census'), { runTicks: ticks });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(policyName).create({ config, log, observer });
    const phases = observerPhases(observer);
    const census = createCensus(config);
    const world = createWorld(config, policy.brain);
    feedPolicy({ policy, observer }, world);
    try {
        for (let t = 0; t < ticks; t++) {
            step(world, policy.brain, phases);
            feedPolicy({ policy, observer }, world);
            noteCensusTick(census, world);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed} failed at tick ${world.tick}: ${message}`, { cause: error });
    }
    return { seed, samples: census.samples, inputs: inputRows(census), outputs: outputRows(census) };
}

if (!isMainThread) {
    serveTasks(runSignals);
}
