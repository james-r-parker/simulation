// The random-genome brain: self-adaptive mutation and neuron-block crossover on the shared birth half, and a random
// genome for every `initBrain` call. It is the untrained baseline the ladder's random arm and the test worlds use; no
// archive and no fitness, so it is not a registered policy. The core draws the specialisation.

import { SIGMA_START, randomWeights } from '../../evo/mutation.js';
import { createBirth, rowOf } from './natural-birth.js';

/**
 * Builds the random brain. Per-run state lives in it: `sigma` (per slot) and `fatherSigma` (per mother, written in
 * `onMate`).
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {{brain: import('../../sim/spawn.js').Policy & Record<string, any>, sigma: Float32Array, fatherSigma: Float32Array}} the brain hooks
 *   `{ initBrain, onMate, childBrain }` and the step sizes they keep
 */
export function createRandomBrain(config) {
    const { sigma, fatherSigma, onMate, childBrain } = createBirth(config);
    /** @type {(Float32Array | undefined)[]} */
    const own = [];

    /** Initial agents, floor spawns and immigrants: a random genome. Draws from `brain-init` only. */
    function initBrain(/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) {
        const count = world.layout.weightCount;
        randomWeights(rowOf(own, world.weights, { slot, count }), world.layout, rng, world.config.leakGeneStart);
        sigma[slot] = SIGMA_START;
    }

    return { brain: { initBrain, onMate, childBrain }, sigma, fatherSigma };
}
