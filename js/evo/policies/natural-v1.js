// natural-v1: the v1 genome on the new core - self-adaptive mutation, neuron-block crossover, `fitnessV1`, and
// random immigrants (every `initBrain` call is a random genome). No archive; the core draws the specialisation.

import { createFitnessV1 } from '../../evo/fitness.js';
import { createLifeCounters, updateLifeCounters } from '../../evo/life-counters.js';
import { SIGMA_START, randomWeights } from '../../evo/mutation.js';
import { createBirth, rowOf } from './natural-birth.js';

/**
 * Builds the natural-v1 policy object. Per-run state lives in it: `sigma` (per slot), `fatherSigma` (per mother,
 * written in `onMate`) and the life counters. The observer only feeds `fitness`.
 * @param {Record<string, any>} options the eval runner's `{ config, log, observer }`; only `config` is read
 * @returns {Record<string, any>} `{ name, brain, fitnessName, fitness, afterStep, sigma, fatherSigma, counters }`
 */
export function createNaturalV1(options) {
    const { config } = options;
    const { sigma, fatherSigma, onMate, childBrain } = createBirth(config);
    const counters = createLifeCounters(config);
    /** @type {(Float32Array | undefined)[]} */
    const own = [];

    /** Initial agents, floor spawns and immigrants: a random genome. Draws from `brain-init` only. */
    function initBrain(/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) {
        const count = world.layout.weightCount;
        randomWeights(rowOf(own, world.weights, { slot, count }), world.layout, rng);
        sigma[slot] = SIGMA_START;
    }

    return {
        name: 'natural-v1',
        brain: { initBrain, onMate, childBrain },
        fitnessName: 'v1',
        fitness: createFitnessV1(counters),
        afterStep: (/** @type {any} */ world) => updateLifeCounters(counters, world),
        sigma,
        fatherSigma,
        counters,
    };
}
