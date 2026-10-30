// baseline-v5: the legacy brain approach on the new core (init N(0, 0.1), uniform crossover, Gaussian mutation).

import { fitnessV5 } from '../../evo/fitness-v5.js';
import { nextFloat, nextGaussian } from '../../sim/rng.js';
import { BORN_CAUSE } from '../../sim/events.js';
import { TRAIT_SIGMA, WEIGHT_CLAMP } from '../../evo/mutation.js';

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
 * @param {import('../../sim/rng.js').Rng} rng
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
 * The legacy macro mutation is rolled per weight (`NeuralNetwork.mutate`), so it is here.
 * @param {Record<string, any>} world
 * @param {number} child
 * @param {number} mother
 * @param {{cause: number, rng: import('../../sim/rng.js').Rng}} opts
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
            const g = w + nextGaussian(rng) * TRAIT_SIGMA;
            weights[child * count + i] = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, g));
            continue;
        }
        w += nextGaussian(rng) * MUTATION_SIGMA;
        if (nextFloat(rng) < MACRO_CHANCE) {
            w += nextGaussian(rng) * MACRO_SIGMA;
        }
        weights[child * count + i] = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, w));
    }
}

/**
 * Builds the baseline-v5 policy object. It keeps no per-run state and has no archive and no `initSpec`.
 * @returns {{name: string, brain: {initBrain: typeof initBrain, childBrain: typeof childBrain}, fitnessName: string, fitness: typeof fitnessV5}}
 */
export function createBaselineV5() {
    return {
        name: 'baseline-v5',
        brain: { initBrain, childBrain },
        fitnessName: 'v5',
        fitness: fitnessV5,
    };
}
