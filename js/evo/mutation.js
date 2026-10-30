// Mutation: the self-adaptive step size, per-weight Gaussian steps and the random initial row.
// Every draw is one `nextGaussian` from the stream the caller passes (the core's `mutation` or `brain-init`).

import { POOLED_VALUES } from '../sim/brain-layout.js';
import { detExp } from '../sim/det-math.js';
import { nextFloat, nextGaussian } from '../sim/rng.js';

/** Smallest mutation step size. */
export const SIGMA_MIN = 0.002;
/** Largest mutation step size. */
export const SIGMA_MAX = 0.5;
/** The step size of a random genome. */
export const SIGMA_START = 0.05;
/** Weights are clamped to plus or minus this. */
export const WEIGHT_CLAMP = 4;
/** The step size of the trait and leak genes once a biology feature is on, in place of the weight step size. */
export const TRAIT_SIGMA = 0.1;

/**
 * The child's step size. Draws one Gaussian.
 * @param {number} parentSigma the parent (or parent mean) step size
 * @param {number} weightCount floats in a weight row; `tau = 1 / sqrt(weightCount)`
 * @param {import('../sim/rng.js').Rng} rng the mutation stream
 * @returns {number} `parentSigma x detExp(tau x N(0, 1))`, clamped to `SIGMA_MIN .. SIGMA_MAX`
 */
export function mutateSigma(parentSigma, weightCount, rng) {
    const tau = 1 / Math.sqrt(weightCount);
    const sigma = parentSigma * detExp(tau * nextGaussian(rng));
    return Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, sigma));
}

/**
 * @typedef {object} MutateOptions
 * @property {number} [traitStart] the first index mutated with `TRAIT_SIGMA`; the default, the row length, uses
 *   `sigma` throughout (callers pass the layout's `traitStart`)
 * @property {number} [rate] the probability that a gene mutates (`resolveMutationRate`); 1, the default, mutates every
 *   gene
 */

/**
 * @param {Float32Array} row the weight row
 * @param {number} i the gene
 * @param {number} size the Gaussian step size
 * @param {import('../sim/rng.js').Rng} rng the mutation stream
 * @returns {void}
 */
function stepGene(row, i, size, rng) {
    row[i] = Math.min(WEIGHT_CLAMP, Math.max(-WEIGHT_CLAMP, row[i] + size * nextGaussian(rng)));
}

/**
 * Adds `sigma x N(0, 1)` to genes in place, then clamps to plus or minus `WEIGHT_CLAMP`. From `traitStart` to the end
 * of the row (the trait and leak genes) the step is `TRAIT_SIGMA` instead of `sigma`.
 * Draw order at rate 1 (the default): one Gaussian per gene, index 0 up. Below 1: per gene, one `nextFloat`, then one
 * Gaussian when it is below the rate, so about `rate x length` genes move.
 * @param {Float32Array} row the weight row (a `subarray` view is fine)
 * @param {number} sigma the step size
 * @param {import('../sim/rng.js').Rng} rng the mutation stream
 * @param {MutateOptions} [options] the trait boundary and the per-gene probability
 * @returns {void}
 */
export function mutateWeights(row, sigma, rng, options = {}) {
    const { traitStart = row.length, rate = 1 } = options;
    for (let i = 0; i < row.length; i++) {
        if (rate < 1 && nextFloat(rng) >= rate) {
            continue;
        }
        stepGene(row, i, i < traitStart ? sigma : TRAIT_SIGMA, rng);
    }
}

/**
 * Fills a row with a random brain in place. Draw order: wIn, wRec, wOut, then wSkip, each index 0 up; biases draw
 * nothing. Weights into hidden units have standard deviation `1 / sqrt(inputCount + hidden)`, weights into outputs
 * `1 / sqrt(hidden)`, skip weights `1 / sqrt(POOLED_VALUES)` (0.144, under `wOut`'s 0.177 at 32 hidden: a skip input
 * is one of 48 pooled values, most of them 0 on any tick, so a birth reflex is a nudge on the output and the hidden
 * layer still decides), biases and trait genes are 0 and leak genes are `leakGeneStart`.
 * @param {Float32Array} row the weight row, `layout.weightCount` floats
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {import('../sim/rng.js').Rng} rng the brain-init stream
 * @param {number} leakGeneStart the leak genes' start value (`config.leakGeneStart`)
 * @returns {void}
 */
export function randomWeights(row, layout, rng, leakGeneStart) {
    const hiddenSd = 1 / Math.sqrt(layout.inputCount + layout.hidden);
    const outSd = 1 / Math.sqrt(layout.hidden);
    for (let i = layout.wIn; i < layout.bHidden; i++) {
        row[i] = hiddenSd * nextGaussian(rng);
    }
    row.fill(0, layout.bHidden, layout.wOut);
    for (let i = layout.wOut; i < layout.bOut; i++) {
        row[i] = outSd * nextGaussian(rng);
    }
    row.fill(0, layout.bOut, layout.wSkip);
    const skipSd = 1 / Math.sqrt(POOLED_VALUES);
    for (let i = layout.wSkip; i < layout.traitStart; i++) {
        row[i] = skipSd * nextGaussian(rng);
    }
    row.fill(0, layout.traitStart, layout.leakStart);
    row.fill(leakGeneStart, layout.leakStart, layout.weightCount);
}
