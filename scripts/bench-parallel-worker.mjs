// Bench-parallel worker: builds the bench world, steps it, and returns its ticks and loop time (see `scripts/bench-parallel.mjs`).
import { isMainThread } from 'node:worker_threads';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} BenchTask
 * @property {number} seed the world seed
 * @property {number} ticks ticks to step
 * @property {number} agents population size, held fixed by min = max = initial
 */

/**
 * @param {BenchTask} task one worker's share
 * @returns {{ ticks: number, elapsedMs: number }} the ticks run and the step loop's time (world build excluded)
 */
export function runBenchTask({ seed, ticks, agents }) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(
        createConfig({ seed, initialAgents: agents, minAgents: agents, maxAgents: agents }),
        policy,
    );
    const start = performance.now();
    for (let i = 0; i < ticks; i++) {
        step(world, policy);
    }
    return { ticks, elapsedMs: performance.now() - start };
}

if (!isMainThread) {
    serveTasks(runBenchTask);
}
