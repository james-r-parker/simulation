// natural-v1: the v1 genome on the new core - self-adaptive mutation, neuron-block crossover, `fitnessV1`, and
// random immigrants (every `initBrain` call is a random genome). No archive; the core draws the specialisation.

import { crossNeurons } from '../../evo/crossover.js';
import { createFitnessV1 } from '../../evo/fitness.js';
import { createLifeCounters, updateLifeCounters } from '../../evo/life-counters.js';
import { SIGMA_START, mutateSigma, mutateWeights, randomWeights } from '../../evo/mutation.js';
import { BORN_CAUSE } from '../../sim/events.js';

/**
 * Row views are built once per slot and reused (a `subarray` allocates), so births allocate nothing after warm-up.
 * A view is rebuilt when the array it was cut from is not the one asked for (a new world).
 * @param {(Float32Array | undefined)[]} cache views by slot
 * @param {Float32Array} array the flat weight array
 * @param {{slot: number, count: number}} at the slot and the row length
 * @returns {Float32Array} the slot's row
 */
function rowOf(cache, array, { slot, count }) {
    let view = cache[slot];
    if (view === undefined || view.buffer !== array.buffer) {
        view = array.subarray(slot * count, (slot + 1) * count);
        cache[slot] = view;
    }
    return view;
}

/**
 * Builds the natural-v1 policy object. Per-run state lives in it: `sigma` (per slot), `fatherSigma` (per mother,
 * written in `onMate`) and the life counters. `archiveRef` and `isClone` arrive with the Phase 2 archive.
 * Without an `observer` (replay) the counters still update; the observer only feeds `fitness`.
 * @param {Record<string, any>} options the eval runner's `{ config, log, observer }`; only `config` is read
 * @returns {Record<string, any>} `{ name, brain, fitnessName, fitness, afterStep, sigma, fatherSigma, counters }`
 */
export function createNaturalV1(options) {
    const { config } = options;
    const sigma = new Float32Array(config.maxAgents);
    const fatherSigma = new Float32Array(config.maxAgents);
    const counters = createLifeCounters(config);
    /** @type {(Float32Array | undefined)[]} */
    const own = [];
    /** @type {(Float32Array | undefined)[]} */
    const motherRows = [];
    /** @type {(Float32Array | undefined)[]} */
    const fatherRows = [];
    /** @type {(Float32Array | undefined)[]} */
    const childRows = [];

    /** Initial agents, floor spawns and immigrants: a random genome. Draws from `brain-init` only. */
    function initBrain(/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) {
        const count = world.layout.weightCount;
        randomWeights(rowOf(own, world.weights, { slot, count }), world.layout, rng);
        sigma[slot] = SIGMA_START;
    }

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
        mutateWeights(row, childSigma, rng);
        sigma[child] = childSigma;
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
