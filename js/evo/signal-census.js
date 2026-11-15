// The signal census (senses-and-motor.md, Signal census): for tracked agents, how often each brain input is not 0, its
// distribution, how much weight leaves it, and how often each action output fires. A detector: it reads the world and
// changes nothing, and no fitness, merit or archive rank reads it.

import { GENE_OUTPUT_COUNT, OUTPUT_COUNT, OUTPUT_INDEX, POOLED_VALUES, brainLayout } from '../sim/brain-layout.js';

/** Input samples are taken when `world.tick` divides by this. */
export const CENSUS_EVERY = 50;
/** Agents tracked: slots 0 to this less one, while alive. */
export const CENSUS_AGENTS = 32;
/** An input is dead when its nonzero share is under this. */
export const DEAD_SHARE = 0.01;
/** An input is unused when its relative use is under this. */
export const UNUSED_USE = 0.1;
/** An input that never leaves a span this wide is `narrow` (a tenth of the unit span the inputs are scaled to). */
export const NARROW_SPAN = 0.1;

/** The actions whose fire share is counted, with the config key of their threshold (null: above 0). */
export const ACTIONS = Object.freeze([
    { output: 'THRUST', threshold: null },
    { output: 'SPRINT', threshold: null },
    { output: 'MATE', threshold: null },
    { output: 'BITE', threshold: null },
    { output: 'ALARM', threshold: 'alarmThreshold' },
    { output: 'SMOKE', threshold: 'smokeThreshold' },
    { output: 'HUNT', threshold: 'huntCallThreshold' },
]);

/**
 * @typedef {object} Census
 * @property {number} samples input samples taken (agents alive at a sample tick, summed)
 * @property {Float64Array} nonzero samples in which each input was not 0
 * @property {Float64Array} sum sum of each input
 * @property {Float64Array} sumSq sum of squares of each input
 * @property {Float64Array} min smallest value of each input
 * @property {Float64Array} max largest value of each input
 * @property {Float64Array} weightSum sum of each input's mean absolute outgoing weight over the samples
 * @property {Float64Array} outSum sum of each output
 * @property {Float64Array} outSumSq sum of squares of each output
 * @property {Float64Array} outNonzero agent-ticks each output was not 0
 * @property {Float64Array} fired agent-ticks each action fired (by `ACTIONS` index)
 * @property {number} outputTicks agent-ticks the outputs were counted over
 */

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Census} an empty census
 */
export function createCensus(config) {
    const n = brainLayout(config).inputCount;
    return {
        samples: 0,
        nonzero: new Float64Array(n),
        sum: new Float64Array(n),
        sumSq: new Float64Array(n),
        min: new Float64Array(n).fill(Infinity),
        max: new Float64Array(n).fill(-Infinity),
        weightSum: new Float64Array(n),
        outSum: new Float64Array(OUTPUT_COUNT),
        outSumSq: new Float64Array(OUTPUT_COUNT),
        outNonzero: new Float64Array(OUTPUT_COUNT),
        fired: new Float64Array(ACTIONS.length),
        outputTicks: 0,
    };
}

/**
 * Adds the mean absolute weight leaving each input of one agent: its `wIn` row and, for a pooled input, its skip row.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {Float64Array} into receives the means, added to what is there
 * @returns {void}
 */
function addUse(world, slot, into) {
    const layout = world.layout;
    const w = world.weights;
    const base = slot * layout.weightCount;
    for (let i = 0; i < layout.inputCount; i++) {
        let total = 0;
        for (let h = 0; h < layout.hidden; h++) {
            total += Math.abs(w[base + layout.wIn + i * layout.hidden + h]);
        }
        let count = layout.hidden;
        if (i < POOLED_VALUES) {
            for (let o = 0; o < GENE_OUTPUT_COUNT; o++) {
                total += Math.abs(w[base + layout.wSkip + i * GENE_OUTPUT_COUNT + o]);
            }
            count += GENE_OUTPUT_COUNT;
        }
        into[i] += total / count;
    }
}

/**
 * Samples one alive agent's input row.
 * @param {Census} census the census
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function sampleAgent(census, world, slot) {
    const n = world.layout.inputCount;
    const row = slot * n;
    for (let i = 0; i < n; i++) {
        const v = world.pooled[row + i];
        census.nonzero[i] += v !== 0 ? 1 : 0;
        census.sum[i] += v;
        census.sumSq[i] += v * v;
        census.min[i] = Math.min(census.min[i], v);
        census.max[i] = Math.max(census.max[i], v);
    }
    addUse(world, slot, census.weightSum);
    census.samples += 1;
}

/**
 * Counts one alive agent's outputs for this tick.
 * @param {Census} census the census
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function countOutputs(census, world, slot) {
    const row = slot * OUTPUT_COUNT;
    for (let o = 0; o < OUTPUT_COUNT; o++) {
        const v = world.outputs[row + o];
        census.outNonzero[o] += v !== 0 ? 1 : 0;
        census.outSum[o] += v;
        census.outSumSq[o] += v * v;
    }
    ACTIONS.forEach((action, a) => {
        const limit = action.threshold === null ? 0 : world.config[action.threshold];
        census.fired[a] += world.outputs[row + OUTPUT_INDEX[action.output]] > limit ? 1 : 0;
    });
    census.outputTicks += 1;
}

/**
 * Feeds the census one tick: the outputs every tick, the input samples every `CENSUS_EVERY` ticks. Call it after each
 * `step`.
 * @param {Census} census the census
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteCensusTick(census, world) {
    const sample = world.tick % CENSUS_EVERY === 0;
    const limit = Math.min(CENSUS_AGENTS, world.alive.length);
    for (let slot = 0; slot < limit; slot++) {
        if (world.alive[slot] === 1) {
            countOutputs(census, world, slot);
            if (sample) {
                sampleAgent(census, world, slot);
            }
        }
    }
}

/**
 * @param {number} nonzeroShare the input's nonzero share
 * @param {number} use the input's use relative to the mean of all inputs
 * @returns {'dead' | 'unused' | 'alive'} the verdict: dead under `DEAD_SHARE`, unused under `UNUSED_USE`
 */
export function verdictOf(nonzeroShare, use) {
    if (nonzeroShare < DEAD_SHARE) {
        return 'dead';
    }
    return use < UNUSED_USE ? 'unused' : 'alive';
}

/**
 * @typedef {object} InputRow
 * @property {number} index the input's index in the brain's input row
 * @property {number} nonzeroShare share of samples in which it was not 0
 * @property {number} mean its mean
 * @property {number} sd its standard deviation
 * @property {number} min its smallest value (0 with no samples)
 * @property {number} max its largest value (0 with no samples)
 * @property {boolean} narrow whether it was not 0 and never left a span of `NARROW_SPAN`
 * @property {number} use mean absolute weight leaving it over the mean of all inputs
 * @property {'dead' | 'unused' | 'alive'} verdict its verdict
 */

/**
 * @param {number} sum sum of values
 * @param {number} sumSq sum of squares
 * @param {number} n count
 * @returns {{mean: number, sd: number}} the mean and population standard deviation
 */
function moments(sum, sumSq, n) {
    if (n === 0) {
        return { mean: 0, sd: 0 };
    }
    const mean = sum / n;
    return { mean, sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

/**
 * @param {Census} census the census
 * @returns {InputRow[]} one row per input, in input order
 */
export function inputRows(census) {
    const n = census.nonzero.length;
    const samples = census.samples;
    const meanWeight = samples === 0 ? 0 : census.weightSum.reduce((a, b) => a + b, 0) / samples / n;
    return Array.from({ length: n }, (_, i) => {
        const { mean, sd } = moments(census.sum[i], census.sumSq[i], samples);
        const min = samples === 0 ? 0 : census.min[i];
        const max = samples === 0 ? 0 : census.max[i];
        const share = samples === 0 ? 0 : census.nonzero[i] / samples;
        const use = samples === 0 || meanWeight === 0 ? 0 : census.weightSum[i] / samples / meanWeight;
        return {
            index: i,
            nonzeroShare: share,
            mean,
            sd,
            min,
            max,
            narrow: share > 0 && max - min < NARROW_SPAN,
            use,
            verdict: verdictOf(share, use),
        };
    });
}

/**
 * @typedef {object} OutputRow
 * @property {string} name the output's `OUTPUT_INDEX` name
 * @property {number} nonzeroShare share of agent-ticks it was not 0
 * @property {number} mean its mean
 * @property {number} sd its standard deviation
 * @property {number | null} fireShare for an action: the share of agent-ticks it fired; null for the others
 */

/**
 * @param {Census} census the census
 * @returns {OutputRow[]} one row per output, in `OUTPUT_INDEX` order
 */
export function outputRows(census) {
    const names = Object.entries(OUTPUT_INDEX)
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);
    const ticks = census.outputTicks;
    return names.map((name, o) => {
        const { mean, sd } = moments(census.outSum[o], census.outSumSq[o], ticks);
        const a = ACTIONS.findIndex((action) => action.output === name);
        let fireShare = null;
        if (a >= 0) {
            fireShare = ticks === 0 ? 0 : census.fired[a] / ticks;
        }
        return { name, nonzeroShare: ticks === 0 ? 0 : census.outNonzero[o] / ticks, mean, sd, fireShare };
    });
}
