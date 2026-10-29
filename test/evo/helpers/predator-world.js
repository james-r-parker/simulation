import { readFileSync } from 'node:fs';
import { createConfig } from '../../../js/sim/config.js';
import { RANDOM_ARM, createControllerBrain } from '../../../js/evo/controller-brain.js';
import { computeMetrics } from '../../../js/evo/metrics.js';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { createBaselineV5 } from '../../../js/evo/policies/baseline-v5.js';
import { createNaturalV1 } from '../../../js/evo/policies/natural-v1.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';
import { PRE_T15D } from './pre-t15d.js';

export const predatorWorld = JSON.parse(
    readFileSync(new URL('../../../evals/predator-world.json', import.meta.url), 'utf8'),
);

/** The survivable-prey duel world (`evals/survivable-prey-world.json`); play it with `SURVIVABLE_PREDATOR_EVERY`. */
export const survivableWorld = JSON.parse(
    readFileSync(new URL('../../../evals/survivable-prey-world.json', import.meta.url), 'utf8'),
);

export const SURVIVABLE_PREDATOR_EVERY = 8;

export const microWorld = JSON.parse(readFileSync(new URL('../../../evals/micro-world.json', import.meta.url), 'utf8'));

const PREDATOR = 1;
const FORAGER = 0;

/**
 * The test policy of `evals/predator-world.json`: the brain hooks given (default baseline-v5's), with predators in the
 * even slots and foragers in the odd ones.
 * @param {any} [brain] the brain hooks
 * @param {number} [predatorEvery] one slot in this many is a predator (default 2: even slots)
 * @returns {any} the policy
 */
export function predatorPolicy(brain = createBaselineV5().brain, predatorEvery = 2) {
    return {
        ...brain,
        initSpec: (/** @type {any} */ _w, /** @type {number} */ slot) =>
            slot % predatorEvery === 0 ? PREDATOR : FORAGER,
    };
}

/**
 * Plays two controllers against each other on `evals/predator-world.json` for one seed.
 * @param {number} seed the world seed
 * @param {number} ticks ticks to run
 * @param {{onTick?: (world: any, observer: any) => void, config?: Record<string, any>, predator?: string,
 *   prey?: string, world?: Record<string, any>, predatorEvery?: number,
 *   scoring?: (config: any) => {fitness: (observer: any, slot: number, config: any) => number,
 *   afterStep: (world: any) => void}}} [options] a per-tick hook, config overrides on top of the world file, the arm of
 *   the predators (default `hunter`) and of the prey (default `fleer`): a key of `SCRIPTED_CONTROLLERS` or `random`;
 *   the world file (default `predatorWorld`) and the predator spacing (default 2); and `scoring`, which builds the
 *   fitness that scores deaths and the hook that feeds its counters, from the run's config
 * @returns {{world: any, observer: any}} the world and observer at the end
 */
export function playPredatorWorld(
    seed,
    ticks,
    {
        onTick = () => {},
        config: extra = {},
        predator = 'hunter',
        prey = 'fleer',
        world: base = predatorWorld,
        predatorEvery = 2,
        scoring,
    } = {},
) {
    const config = createConfig({ ...SIMPLE_WORLD, ...PRE_T15D, ...base, ...extra, seed });
    const random = predator === RANDOM_ARM || prey === RANDOM_ARM;
    const policy = predatorPolicy(random ? createNaturalV1({ config }).brain : undefined, predatorEvery);
    const world = createWorld(config, policy);
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    const { fitness, afterStep } = scoring?.(config) ?? { fitness: undefined, afterStep: () => {} };
    observe(observer, world, fitness);
    afterStep(world);
    const brain = createControllerBrain(world, fork(createRng(seed), 'scripted'), { canHunt: predator, rest: prey });
    const overrides = { ...observerPhases(observer), brain };
    for (let t = 0; t < ticks; t++) {
        step(world, policy, overrides);
        observe(observer, world, fitness);
        afterStep(world);
        onTick(world, observer);
    }
    return { world, observer };
}

/**
 * Plays one controller on every agent of `evals/micro-world.json` for one seed.
 * @param {number} seed the world seed
 * @param {number} ticks ticks to run
 * @param {string} arm a key of `SCRIPTED_CONTROLLERS` or `random`
 * @param {Record<string, any>} [extra] config overrides on top of the world file
 * @param {(world: any) => void} [onTick] called after every tick
 * @returns {{world: any, observer: any}} the world and observer at the end
 */
export function playMicroWorld(seed, ticks, arm, extra = {}, onTick = () => {}) {
    const config = createConfig({ ...SIMPLE_WORLD, ...PRE_T15D, ...microWorld, ...extra, seed });
    const policy = arm === RANDOM_ARM ? createNaturalV1({ config }).brain : createBaselineV5().brain;
    const world = createWorld(config, policy);
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    observe(observer, world);
    const brain = createControllerBrain(world, fork(createRng(seed), 'scripted'), arm);
    const overrides = { ...observerPhases(observer), brain };
    for (let t = 0; t < ticks; t++) {
        step(world, policy, overrides);
        observe(observer, world);
        onTick(world);
    }
    return { world, observer };
}

/**
 * Plays two controllers against each other for one seed and computes the metrics.
 * @param {number} seed the world seed
 * @param {number} ticks ticks to run
 * @param {Record<string, any>} [config] config overrides on top of the file
 * @param {{predator?: string, prey?: string, world?: Record<string, any>, predatorEvery?: number}} [arms] the arms
 *   (and world), as `playPredatorWorld` takes them
 * @returns {Record<string, import('../../../js/evo/metrics-stats.js').MetricResult>} the run's metrics
 */
export function runPredatorWorld(seed, ticks, config = {}, arms = {}) {
    const { world, observer } = playPredatorWorld(seed, ticks, { config, ...arms });
    return computeMetrics(observer, world);
}
