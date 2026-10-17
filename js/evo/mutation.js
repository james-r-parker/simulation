// Mutation: the self-adaptive step size, per-weight Gaussian steps and the random initial row.
// Every draw is one `nextGaussian` from the stream the caller passes (the core's `mutation` or `brain-init`).

import { detExp } from '../sim/det-math.js';
import { nextGaussian } from '../sim/rng.js';

/** Smallest mutation step size. */
export const SIGMA_MIN = 0.002;
/** Largest mutation step size. */
export const SIGMA_MAX = 0.5;
/** The step size of a random genome. */
export const SIGMA_START = 0.05;
/** Weights are clamped to plus or minus this. */
export const WEIGHT_CLAMP = 4;
/** A random genome's leak genes start here, so a hidden unit keeps about 5% of its old value (`a` about 0.95). */
export const LEAK_GENE_START = 3;

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
 * Adds `sigma x N(0, 1)` to every weight in place, then clamps to plus or minus `WEIGHT_CLAMP`.
 * Draw order: one Gaussian per weight, index 0 up.
 * @param {Float32Array} row the weight row (a `subarray` view is fine)
 * @param {number} sigma the step size
 * @param {import('../sim/rng.js').Rng} rng the mutation stream
 * @returns {void}
 */
export function mutateWeights(row, sigma, rng) {
    for (let i = 0; i < row.length; i++) {
        row[i] = Math.min(WEIGHT_CLAMP, Math.max(-WEIGHT_CLAMP, row[i] + sigma * nextGaussian(rng)));
    }
}

/**
 * Fills a row with a random brain in place. Draw order: wIn, wRec, then wOut, each index 0 up; biases draw nothing.
 * Weights into hidden units have standard deviation `1 / sqrt(inputCount + hidden)`, weights into outputs
 * `1 / sqrt(hidden)`, biases, trait genes are 0 and leak
 * genes are `LEAK_GENE_START`.
 * @param {Float32Array} row the weight row, `layout.weightCount` floats
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {import('../sim/rng.js').Rng} rng the brain-init stream
 * @returns {void}
 */
export function randomWeights(row, layout, rng) {
    const hiddenSd = 1 / Math.sqrt(layout.inputCount + layout.hidden);
    const outSd = 1 / Math.sqrt(layout.hidden);
    for (let i = layout.wIn; i < layout.bHidden; i++) {
        row[i] = hiddenSd * nextGaussian(rng);
    }
    row.fill(0, layout.bHidden, layout.wOut);
    for (let i = layout.wOut; i < layout.bOut; i++) {
        row[i] = outSd * nextGaussian(rng);
    }
    row.fill(0, layout.bOut, layout.leakStart);
    row.fill(LEAK_GENE_START, layout.leakStart, layout.weightCount);
}
