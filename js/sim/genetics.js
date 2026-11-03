// Genetic distance between two agents, read from a fixed sample of their weight rows.

import { POOLED_VALUES } from './brain-layout.js';

/** @typedef {import('./world.js').World} World */

/** How many weight indices `geneticDistance` averages over. */
export const SIMILARITY_DIMS = 64;

/** The prime stride that spreads the sampled indices over every hidden unit. */
const STRIDE = 7919;

/** @type {WeakMap<object, {index: Int32Array, invSd: Float64Array}>} the sample per layout, built on first use */
const SAMPLES = new WeakMap();

/**
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @param {number} i an index in `0 .. traitStart`
 * @returns {number} the inverse square of the random-init sd of `i`'s block
 */
function blockSdSquared(layout, i) {
    if (i < layout.bHidden) {
        return layout.inputCount + layout.hidden;
    }
    return i >= layout.wSkip ? POOLED_VALUES : layout.hidden;
}

/**
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {{index: Int32Array, invSd: Float64Array}} the sampled indices `(k x 7919) mod traitStart` and the inverse
 *   random-init sd of each one's block: `sqrt(inputCount + hidden)` in `wIn` and `wRec`, `sqrt(POOLED_VALUES)` in `wSkip`,
 *   `sqrt(hidden)` elsewhere
 */
function sampleOf(layout) {
    let sample = SAMPLES.get(layout);
    if (sample === undefined) {
        const index = new Int32Array(SIMILARITY_DIMS);
        const invSd = new Float64Array(SIMILARITY_DIMS);
        for (let k = 0; k < SIMILARITY_DIMS; k++) {
            index[k] = (k * STRIDE) % layout.traitStart;
            invSd[k] = Math.sqrt(blockSdSquared(layout, index[k]));
        }
        sample = { index, invSd };
        SAMPLES.set(layout, sample);
    }
    return sample;
}

/**
 * @param {World} world the world
 * @param {number} a an agent slot
 * @param {number} b another agent slot
 * @returns {number} the mean over the `SIMILARITY_DIMS` sampled weights of `|w_a - w_b| / blockInitSd`: 0 for clones,
 *   about 1.13 for two unrelated random genomes. The trait and leak genes are not sampled.
 */
export function geneticDistance(world, a, b) {
    const { index, invSd } = sampleOf(world.layout);
    const { weights } = world;
    const count = world.layout.weightCount;
    const rowA = a * count;
    const rowB = b * count;
    let sum = 0;
    for (let k = 0; k < SIMILARITY_DIMS; k++) {
        sum += Math.abs(weights[rowA + index[k]] - weights[rowB + index[k]]) * invSd[k];
    }
    return sum / SIMILARITY_DIMS;
}

/**
 * Copies a slot's `SIMILARITY_DIMS` sampled weights, the genotype a strain records from its first host.
 * @param {World} world the world
 * @param {number} slot an agent slot
 * @param {Float32Array} out receives the sample
 * @param {number} offset where in `out` the sample starts
 * @returns {void}
 */
export function sampleGenotype(world, slot, out, offset) {
    const { index } = sampleOf(world.layout);
    const row = slot * world.layout.weightCount;
    for (let k = 0; k < SIMILARITY_DIMS; k++) {
        out[offset + k] = world.weights[row + index[k]];
    }
}

/**
 * @param {World} world the world
 * @param {Float32Array} genotypes the stored samples, `SIMILARITY_DIMS` per entry
 * @param {number} offset where the sample starts
 * @param {number} slot an agent slot
 * @returns {number} the distance from the slot to the sample on `geneticDistance`'s scale: equal to `geneticDistance`
 *   from the sampled agent while its weights are unchanged
 */
export function distanceToGenotype(world, genotypes, offset, slot) {
    const { index, invSd } = sampleOf(world.layout);
    const row = slot * world.layout.weightCount;
    let sum = 0;
    for (let k = 0; k < SIMILARITY_DIMS; k++) {
        sum += Math.abs(world.weights[row + index[k]] - genotypes[offset + k]) * invSd[k];
    }
    return sum / SIMILARITY_DIMS;
}
