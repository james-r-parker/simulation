// Food-ratio worker: runs one seed and counts what the agents ate (see `scripts/food-ratio.mjs`).
import { isMainThread } from 'node:worker_threads';
import { createObserver, observerPhases } from '../js/evo/observer.js';
import { getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { feedPolicy } from './lib/feed-policy.mjs';
import { serveTasks } from './lib/worker-pool.mjs';

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
 * Runs one seed with the observer the eval uses (the live policy needs it), so the world steps as in `npm run eval`.
 * @param {{ seed: number, ticks: number, policy: string, overrides: Record<string, any> }} task the task
 * @returns {import('./lib/food-ratio.mjs').SeedFood & { seed: number }} the counts over every tick
 */
export function runSeed({ seed, ticks, policy: policyName, overrides }) {
    const config = createConfig({ ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: ticks, checkpointTicks: 1000 });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(policyName).create({ config, log, observer });
    const world = createWorld(config, policy.brain);
    const phases = observerPhases(observer);
    feedPolicy({ policy, observer }, world);
    let agentTicks = 0;
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        feedPolicy({ policy, observer }, world);
        agentTicks += world.population;
    }
    return {
        seed,
        ticks,
        agentTicks,
        plantMeals: world.floraMeals[0],
        plantEnergy: sum(world.floraIntake),
        allEnergy: sum(world.foodEatenBySpec),
    };
}

if (!isMainThread) {
    serveTasks(runSeed);
}
