// Runs one ladder rung on one seed: every agent driven by the rung's controllers, and the metrics at the end.

import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { createWorld } from '../sim/spawn.js';
import { step } from '../sim/step.js';
import { RANDOM_ARM, createControllerBrain } from './controller-brain.js';
import { computeMetrics } from './metrics.js';
import { createObserver, observe, observerPhases } from './observer.js';
import { createBaselineV5 } from './policies/baseline-v5.js';
import { createNaturalV1 } from './policies/natural-v1.js';

/** The metrics a rung records: food, births and the deliberate-behaviour metrics. */
export const RUNG_METRICS = Object.freeze([
    'eval.food_energy_per_1k',
    'eval.births_per_1k',
    'eval.deliberate_food_share',
    'eval.pursuit_bite_share',
    'eval.pack_convergence',
    'eval.hunt_call_answer',
    'eval.evasion_skill',
    'eval.group_cohesion_under_threat',
    'eval.alarm_precision',
    'eval.hunt_call_precision',
    'eval.smoke_precision',
    'eval.undefended_bite_share',
]);

/**
 * @typedef {object} RungRun
 * @property {number} seed the world seed
 * @property {string} rung the rung's name
 * @property {number} ticks ticks run
 * @property {number} population agents alive at the end
 * @property {Record<string, number | null>} metrics `RUNG_METRICS`, each `null` when it has no value
 */

/**
 * Runs one rung on one seed in the default world with no floor and no immigrants, so only births refill it.
 * @param {{rung: import('./ladder.js').Rung, seed: number, ticks: number, overrides?: Record<string, any>}} task the
 *   rung, the seed, the tick count and config overrides (`minAgents`, `immigrationInterval` and `seed` are set here)
 * @returns {RungRun} the rung's final population and metrics
 */
export function runControllerSeed({ rung, seed, ticks, overrides = {} }) {
    const config = createConfig({ ...overrides, minAgents: 0, immigrationInterval: 0, seed });
    const arms = rung.arms;
    const random = typeof arms === 'string' ? arms === RANDOM_ARM : [arms.canHunt, arms.rest].includes(RANDOM_ARM);
    const policy = random ? createNaturalV1({ config }).brain : createBaselineV5().brain;
    const world = createWorld(config, policy);
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    observe(observer, world);
    const phases = {
        ...observerPhases(observer),
        brain: createControllerBrain(world, fork(createRng(seed), 'scripted'), arms),
    };
    for (let t = 0; t < ticks; t++) {
        step(world, policy, phases);
        observe(observer, world);
    }
    const all = computeMetrics(observer, world);
    return {
        seed,
        rung: rung.name,
        ticks,
        population: world.population,
        metrics: Object.fromEntries(RUNG_METRICS.map((name) => [name, all[name].value])),
    };
}
