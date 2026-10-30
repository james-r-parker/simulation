// Whether selection moved the instinct prior (natural-selection.md, Detectors, `eval.instinct_drift`): per checkpoint,
// over the sampled living genomes (`observer.sampled`), the mean absolute difference between each instinct cell (the
// `wSkip` and `bOut` cells `applyInstinct` writes for the genome's specialisation) and its prior value, over the same
// mean for the first sample (the founders); the metric is the mean over checkpoints at or after burn-in. 1 is the
// founders' own distance from the prior. It measures distance, not direction. `null` when `instinctWeight` is 0.

import { brainLayout } from '../sim/brain-layout.js';
import { specParams } from '../sim/spec-params.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { applyInstinct } from './instinct.js';
import { none, ok } from './metrics-stats.js';

/** The direction of the metric here. */
export const INSTINCT_DIRECTIONS = Object.freeze({ 'eval.instinct_drift': 'watch' });

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {{weight: number, canHunt: boolean}} options the instinct weight and whether the body hunts
 * @returns {{cells: Int32Array, prior: Float32Array}} the cells `applyInstinct` writes and their value on a zero row
 */
export function instinctCells(layout, options) {
    const row = new Float32Array(layout.weightCount);
    applyInstinct(row, layout, options);
    /** @type {number[]} */
    const cells = [];
    for (let i = 0; i < row.length; i++) {
        if (row[i] !== 0) {
            cells.push(i);
        }
    }
    return { cells: Int32Array.from(cells), prior: Float32Array.from(cells, (i) => row[i]) };
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} the drift pools: the hunter's and the non-hunter's cells, the founders' distance and
 *   the sum of the checkpoint ratios
 */
export function createInstinctPools(config) {
    const layout = brainLayout(config);
    const weight = config.instinctWeight;
    return {
        weight,
        hunter: instinctCells(layout, { weight, canHunt: true }),
        other: instinctCells(layout, { weight, canHunt: false }),
        founders: NaN,
        ratioSum: 0,
        ratios: 0,
    };
}

/**
 * @param {Record<string, any>} pools the drift pools
 * @param {Record<string, any>} world the world
 * @param {Int32Array} slots the sampled slots
 * @returns {number} the mean absolute distance of the sampled genomes' instinct cells from their prior, NaN for none
 */
export function priorDistance(pools, world, slots) {
    const n = world.layout.weightCount;
    let sum = 0;
    let cells = 0;
    for (let s = 0; s < slots.length; s++) {
        const slot = slots[s];
        const { cells: at, prior } = specParams(world.config, world.spec[slot]).canHunt ? pools.hunter : pools.other;
        for (let c = 0; c < at.length; c++) {
            sum += Math.abs(world.weights[slot * n + at[c]] - prior[c]);
        }
        cells += at.length;
    }
    return cells > 0 ? sum / cells : NaN;
}

/**
 * The checkpoint sampler: the first sample sets the founders' distance, and each one at or after burn-in adds its ratio
 * to it.
 * @param {Record<string, any>} pools the drift pools
 * @param {Record<string, any>} observer the observer, whose `sampled` holds this checkpoint's slots
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleInstinct(pools, observer, world) {
    if (pools.weight === 0) {
        return;
    }
    const distance = priorDistance(pools, world, observer.sampled);
    if (Number.isNaN(distance)) {
        return;
    }
    if (Number.isNaN(pools.founders)) {
        pools.founders = distance;
    }
    if (world.tick >= BURN_IN_TICKS && pools.founders > 0) {
        pools.ratioSum += distance / pools.founders;
        pools.ratios += 1;
    }
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} `eval.instinct_drift`
 */
export function instinctMetrics(observer) {
    const pools = observer.instinct;
    if (pools.weight === 0) {
        return { 'eval.instinct_drift': none('instinctWeight is 0: there is no prior') };
    }
    return {
        'eval.instinct_drift':
            pools.ratios > 0 ? ok(pools.ratioSum / pools.ratios) : none('no checkpoint sample after burn-in'),
    };
}
