// The reference brain policy: Gaussian-initialised weights, and a child that is its mother plus Gaussian noise.

import { nextGaussian } from './rng.js';

/** Default scale of the initial weights. */
export const DEFAULT_INIT_SCALE = 1;

/** Default standard deviation of the noise added to each inherited weight. */
export const DEFAULT_MUTATION_SIGMA = 0.02;

/**
 * @param {Record<string, any>} layout the brain layout
 * @param {number} i the index within the weight row
 * @param {import('./rng.js').Rng} rng the stream to draw from
 * @param {number} initScale the overall init scale
 * @returns {number} the initial weight; biases are 0 and draw nothing
 */
function initWeight(layout, i, rng, initScale) {
    if (i < layout.bHidden) {
        return (nextGaussian(rng) * initScale) / Math.sqrt(layout.inputCount + layout.hidden);
    }
    if (i >= layout.wOut && i < layout.bOut) {
        return (nextGaussian(rng) * initScale) / Math.sqrt(layout.hidden);
    }
    return 0;
}

/**
 * Builds the reference policy.
 * @param {{initScale?: number, mutationSigma?: number}} [options] overrides for the named defaults
 * @returns {{initBrain: (world: Record<string, any>, slot: number, rng: import('./rng.js').Rng) => void, childBrain: (world: Record<string, any>, child: number, mother: number, opts: {cause: number, rng: import('./rng.js').Rng}) => void}}
 */
export function cloneWithNoisePolicy(options = {}) {
    const initScale = options.initScale ?? DEFAULT_INIT_SCALE;
    const mutationSigma = options.mutationSigma ?? DEFAULT_MUTATION_SIGMA;
    return {
        initBrain(world, slot, rng) {
            const { weights, layout } = world;
            const base = slot * layout.weightCount;
            for (let i = 0; i < layout.weightCount; i++) {
                weights[base + i] = initWeight(layout, i, rng, initScale);
            }
        },
        childBrain(world, child, mother, opts) {
            const { weights, layout } = world;
            const count = layout.weightCount;
            for (let i = 0; i < count; i++) {
                weights[child * count + i] = weights[mother * count + i] + nextGaussian(opts.rng) * mutationSigma;
            }
        },
    };
}
