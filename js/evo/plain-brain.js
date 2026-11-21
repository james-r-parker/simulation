// The plain brain: the legacy brain operations on the new core (init N(0, 0.1), uniform crossover, Gaussian mutation).
// Not a registered policy and it selects on nothing; the league and the controller runs use it as a fixed brain.

import { nextFloat, nextGaussian } from '../sim/rng.js';
import { TRAITS } from '../sim/body-traits.js';
import { BORN_CAUSE } from '../sim/events.js';
import { TRAIT_SIGMA, WEIGHT_CLAMP } from './mutation.js';

/** NN_WEIGHT_INIT_STD_DEV */
export const INIT_SIGMA = 0.1;
/** UNIFORM_CROSSOVER_PROBABILITY */
export const CROSSOVER_PROBABILITY = 0.5;
/** BASE_MUTATION_RATE x NN_MUTATION_STD_DEV_RATIO (0.1 x 0.3) */
export const MUTATION_SIGMA = 0.03;
/** NN_MACRO_MUTATION_CHANCE */
export const MACRO_CHANCE = 0.02;
/** BASE_MUTATION_RATE x 3.0, the literal in `NeuralNetwork.mutate` */
export const MACRO_SIGMA = 0.3;
/** NN_WEIGHT_CLAMP_MIN */
export const CLAMP_MIN = -3;
/** NN_WEIGHT_CLAMP_MAX */
export const CLAMP_MAX = 3;

/**
 * @param {Record<string, any>} world
 * @param {number} slot
 * @param {import('../sim/rng.js').Rng} rng
 * @returns {void}
 */
function initBrain(world, slot, rng) {
    const count = world.layout.weightCount;
    for (let i = 0; i < count; i++) {
        world.weights[slot * count + i] = nextGaussian(rng) * INIT_SIGMA;
    }
    // the same trait and leak genes as the live policy (`randomWeights`); the draws above are unchanged
    const { traitStart, leakStart } = world.layout;
    world.weights.fill(0, slot * count + traitStart, slot * count + leakStart);
    world.weights.fill(world.config.leakGeneStart, slot * count + leakStart, (slot + 1) * count);
}

/**
 * The step of one gene at or after `traitStart` and the clamp it ends at: a trait gene takes the registry's step
 * (`traitMutationSigma` x `sigmaScale`, as `mutateTraits` does) and `traitGeneClamp`; a leak gene `TRAIT_SIGMA` and
 * `WEIGHT_CLAMP`.
 * @param {Record<string, any>} world the world
 * @param {number} gene the gene's offset from `traitStart`
 * @returns {{sigma: number, clamp: number}} the step and the clamp
 */
function geneStep(world, gene) {
    if (world.layout.traitStart + gene >= world.layout.leakStart) {
        return { sigma: TRAIT_SIGMA, clamp: WEIGHT_CLAMP };
    }
    const scale = TRAITS.find((trait) => trait.index === gene)?.sigmaScale ?? 1;
    return { sigma: world.config.traitMutationSigma * scale, clamp: world.config.traitGeneClamp };
}

/**
 * The legacy macro mutation is rolled per weight (`NeuralNetwork.mutate`), so it is here.
 * @param {Record<string, any>} world
 * @param {number} child
 * @param {number} mother
 * @param {{cause: number, rng: import('../sim/rng.js').Rng}} opts
 * @returns {void}
 */
function childBrain(world, child, mother, opts) {
    const { weights, fatherWeights, layout } = world;
    const count = layout.weightCount;
    const mate = opts.cause === BORN_CAUSE.MATE;
    const { rng } = opts;
    // the trait and leak genes (the end of the row) mutate as the live policy's do
    const geneStart = layout.traitStart;
    for (let i = 0; i < count; i++) {
        let w = weights[mother * count + i];
        if (mate && nextFloat(rng) < CROSSOVER_PROBABILITY) {
            w = fatherWeights[mother * count + i];
        }
        if (i >= geneStart) {
            const { sigma, clamp } = geneStep(world, i - geneStart);
            weights[child * count + i] = Math.max(-clamp, Math.min(clamp, w + nextGaussian(rng) * sigma));
            continue;
        }
        w += nextGaussian(rng) * MUTATION_SIGMA;
        if (nextFloat(rng) < MACRO_CHANCE) {
            w += nextGaussian(rng) * MACRO_SIGMA;
        }
        weights[child * count + i] = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, w));
    }
}

/** The plain brain hooks `{ initBrain, childBrain }`; they keep no per-run state. */
export const plainBrain = Object.freeze({ initBrain, childBrain });
