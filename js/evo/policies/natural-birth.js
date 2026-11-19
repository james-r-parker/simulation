// The birth half shared by the random brain and the MAP-Elites policies: per-slot `sigma`, per-mother `fatherSigma`, `onMate`
// and `childBrain` (self-adaptive mutation, neuron-block crossover).

import { crossNeurons } from '../../evo/crossover.js';
import { mutateSigma, mutateWeights } from '../../evo/mutation.js';
import { decaySilentInputs } from '../../evo/weight-decay.js';
import { applyHunterReflex } from '../../evo/instinct.js';
import { brainLayout } from '../../sim/brain-layout.js';
import { resolveMutationRate } from '../../sim/mutation-rate.js';
import { BORN_CAUSE } from '../../sim/events.js';

/**
 * Row views are built once per slot and reused (a `subarray` allocates), so births allocate nothing after warm-up.
 * A view is rebuilt when the array it was cut from is not the one asked for (a new world).
 * @param {(Float32Array | undefined)[]} cache views by slot
 * @param {Float32Array} array the flat weight array
 * @param {{slot: number, count: number}} at the slot and the row length
 * @returns {Float32Array} the slot's row
 */
export function rowOf(cache, array, { slot, count }) {
    let view = cache[slot];
    if (view === undefined || view.buffer !== array.buffer) {
        view = array.subarray(slot * count, (slot + 1) * count);
        cache[slot] = view;
    }
    return view;
}

/**
 * Writes the hunter reflexes into a child's row before mutation (hunter-learning.md T6): the prey terms when
 * the child's specialisation `canHunt` while its mother's does not, and the kin pull floor for every `canHunt` child. Draws nothing.
 * @param {Record<string, any>} world the world
 * @param {{child: number, mother: number, row: Float32Array}} birth the child, its mother and the child's weight row
 * @returns {void}
 */
export function applyBirthReflex(world, { child, mother, row }) {
    const { config } = world;
    if (world.huntBySpec[world.spec[child]] !== 1) {
        return;
    }
    const flip = world.huntBySpec[world.spec[mother]] !== 1;
    const kinPull = config.kinPullWeight;
    if (flip || kinPull > 0) {
        applyHunterReflex(row, world.layout, { weight: config.instinctWeight, prey: flip, kinPull });
    }
}

/**
 * Lets the eval observer see a birth half: the brain metrics read its step sizes (`observer.sigma`).
 * @param {Record<string, any>} observer the eval observer
 * @param {{sigma: Float32Array}} birth a `createBirth` result
 * @returns {void}
 */
export function shareBirth(observer, birth) {
    observer.sigma = birth.sigma;
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {{sigma: Float32Array, fatherSigma: Float32Array, mutation: {traitStart: number, rate: number}, onMate: Function, childBrain: Function}}
 *   the step sizes (per slot, and per mother for the coming child),
 *   `mutation` (the options every `mutateWeights` call takes) and the two hooks that use them
 */
export function createBirth(config) {
    const sigma = new Float32Array(config.maxAgents);
    const fatherSigma = new Float32Array(config.maxAgents);
    const layout0 = brainLayout(config);
    const mutation = {
        traitStart: layout0.traitStart,
        rate: resolveMutationRate(config.mutationRate, layout0.weightCount),
    };
    /** @type {(Float32Array | undefined)[]} */
    const motherRows = [];
    /** @type {(Float32Array | undefined)[]} */
    const fatherRows = [];
    /** @type {(Float32Array | undefined)[]} */
    const childRows = [];

    /** Remembers the father's step size for the mother's coming child. */
    function onMate(/** @type {any} */ _world, /** @type {number} */ mother, /** @type {number} */ father) {
        fatherSigma[mother] = sigma[father];
    }

    /**
     * Draw order, all from the `mutation` stream: sigma (one Gaussian), then crossover (one float per hidden
     * neuron, `mate` only), then the weights (one Gaussian each, index 0 up).
     */
    function childBrain(
        /** @type {any} */ world,
        /** @type {number} */ child,
        /** @type {number} */ mother,
        /** @type {{cause: number, rng: any}} */ { cause, rng },
    ) {
        const { layout } = world;
        const count = layout.weightCount;
        const mate = cause === BORN_CAUSE.MATE;
        const parentSigma = mate ? (sigma[mother] + fatherSigma[mother]) / 2 : sigma[mother];
        const childSigma = mutateSigma(parentSigma, count, rng);
        const row = rowOf(childRows, world.weights, { slot: child, count });
        const motherRow = rowOf(motherRows, world.weights, { slot: mother, count });
        if (mate) {
            const fatherRow = rowOf(fatherRows, world.fatherWeights, { slot: mother, count });
            const columns = crossNeurons(row, motherRow, fatherRow, { layout, rng });
            world.biteSkipParent[child] = columns.biteParent;
            world.thrustSkipParent[child] = columns.thrustParent;
        } else {
            row.set(motherRow);
        }
        applyBirthReflex(world, { child, mother, row });
        mutateWeights(row, childSigma, rng, mutation);
        if (config.weightDecay > 0) {
            decaySilentInputs(row, { layout, silent: world.inputActivity.rare, decay: config.weightDecay });
        }
        sigma[child] = childSigma;
    }

    return { sigma, fatherSigma, mutation, onMate, childBrain };
}
