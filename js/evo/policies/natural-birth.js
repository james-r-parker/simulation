// The birth half shared by `natural-v1` and `map-elites-v1`: per-slot `sigma`, per-mother `fatherSigma`, `onMate`
// and `childBrain` (self-adaptive mutation, neuron-block crossover).

import { crossNeurons } from '../../evo/crossover.js';
import { mutateSigma, mutateWeights } from '../../evo/mutation.js';
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
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {{sigma: Float32Array, fatherSigma: Float32Array, onMate: Function, childBrain: Function}} the step sizes
 *   (per slot, and per mother for the coming child) and the two hooks that use them
 */
export function createBirth(config) {
    const sigma = new Float32Array(config.maxAgents);
    const fatherSigma = new Float32Array(config.maxAgents);
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
            crossNeurons(row, motherRow, fatherRow, { layout, rng });
        } else {
            row.set(motherRow);
        }
        mutateWeights(row, childSigma, rng, layout.traitStart);
        sigma[child] = childSigma;
    }

    return { sigma, fatherSigma, onMate, childBrain };
}
