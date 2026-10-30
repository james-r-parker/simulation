// Weight and input diagnostics (brain-capacity-and-memory.md, Metrics). All are read on the row the genome multiplies,
// the `pooled` row: how much of it is ever nonzero (`js/sim/input-activity.js`), whether the weights of silent inputs drift to
// the clamp (`eval.weight_drift_silent`), how many weights sit at the clamp, how a first firing of a rare input moves the
// hidden state (`rare-saturation.js`) and the mean mutation step size. The checkpoint figures read the sampled agents
// (`observer.sampled`) at or after burn-in. All `watch`.

import { meanActiveShare } from '../sim/input-activity.js';
import { MIN_EVENTS } from './rare-saturation.js';
import { none, ok, share } from './metrics-stats.js';

/** A weight with an absolute value at least this counts as at the clamp (the clamp is 4). */
export const CLAMP_LEVEL = 3.9;

/** The direction of each metric here. */
export const WEIGHT_DIRECTIONS = Object.freeze({
    'eval.input_active_share': 'watch',
    'eval.weight_drift_silent': 'watch',
    'eval.weight_clamp_share': 'watch',
    'eval.rare_input_saturation_jump': 'watch',
    'eval.sigma_mean': 'watch',
});

/**
 * @returns {Record<string, number>} empty checkpoint pools
 */
export function createWeightPools() {
    return { ratioSum: 0, ratios: 0, clamped: 0, weights: 0, sigmaSum: 0, sigmaAgents: 0 };
}

/**
 * @param {Float32Array} weights the flat weight array
 * @param {{from: number, to: number}} range the half-open index range
 * @returns {number} the sum of absolute values
 */
function absSum(weights, range) {
    let sum = 0;
    for (let i = range.from; i < range.to; i++) {
        sum += Math.abs(weights[i]);
    }
    return sum;
}

/**
 * Adds the checkpoint's ratio of the mean absolute `wIn` weight on rare inputs to the mean on the others.
 * @param {Record<string, number>} pools the weight pools
 * @param {{world: Record<string, any>, activity: Record<string, any>, slots: Int32Array}} source the world, the
 *   activity state and the sampled slots
 * @returns {void}
 */
function addSilentDrift(pools, source) {
    const { world, activity, slots } = source;
    const { layout, weights } = world;
    const H = layout.hidden;
    if (activity.rareCount === 0 || activity.rareCount === layout.inputCount || slots.length === 0) {
        return;
    }
    let rareSum = 0;
    let otherSum = 0;
    for (let s = 0; s < slots.length; s++) {
        const base = slots[s] * layout.weightCount + layout.wIn;
        for (let i = 0; i < layout.inputCount; i++) {
            const sum = absSum(weights, { from: base + i * H, to: base + (i + 1) * H });
            if (activity.rare[i] === 1) {
                rareSum += sum;
            } else {
                otherSum += sum;
            }
        }
    }
    const rareMean = rareSum / (slots.length * activity.rareCount * H);
    const otherMean = otherSum / (slots.length * (layout.inputCount - activity.rareCount) * H);
    if (otherMean > 0) {
        pools.ratioSum += rareMean / otherMean;
        pools.ratios += 1;
    }
}

/**
 * Adds the sampled agents' `wIn`, `wRec` and `wOut` weights at the clamp.
 * @param {Record<string, number>} pools the weight pools
 * @param {{world: Record<string, any>, slots: Int32Array}} source the world and the sampled slots
 * @returns {void}
 */
function addClamp(pools, source) {
    const { world, slots } = source;
    const { layout, weights } = world;
    for (let s = 0; s < slots.length; s++) {
        const base = slots[s] * layout.weightCount;
        for (const [from, to] of [
            [layout.wIn, layout.bHidden],
            [layout.wOut, layout.bOut],
        ]) {
            for (let i = base + from; i < base + to; i++) {
                pools.clamped += Math.abs(weights[i]) >= CLAMP_LEVEL ? 1 : 0;
            }
            pools.weights += to - from;
        }
    }
}

/**
 * Adds every alive agent's step size from the policy's `sigma` array.
 * @param {Record<string, number>} pools the weight pools
 * @param {Record<string, any>} observer the observer (`sigma`, set by a policy that has one)
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function addSigma(pools, observer, world) {
    if (observer.sigma === undefined) {
        return;
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            pools.sigmaSum += observer.sigma[slot];
            pools.sigmaAgents += 1;
        }
    }
}

/**
 * Samples the checkpoint figures. Call once per checkpoint at or after burn-in, after `diversity` has set
 * `observer.sampled`; it draws nothing.
 * @param {Record<string, number>} pools the weight pools
 * @param {Record<string, any>} observer the observer (`sampled`, `activity`, `sigma`)
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleWeights(pools, observer, world) {
    const source = { world, activity: observer.activity, slots: observer.sampled };
    addSilentDrift(pools, source);
    addClamp(pools, source);
    addSigma(pools, observer, world);
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the five metrics
 */
export function weightMetrics(observer) {
    const p = observer.weightPools;
    const active = meanActiveShare(observer.activity);
    const { saturation } = observer;
    const jump =
        saturation.events >= MIN_EVENTS
            ? ok(saturation.jumpSum / saturation.events)
            : none(`fewer than ${MIN_EVENTS} first firings of a rare input`);
    return {
        'eval.input_active_share': active === null ? none('no input-activity sample after burn-in') : ok(active),
        'eval.weight_drift_silent':
            p.ratios > 0 ? ok(p.ratioSum / p.ratios) : none('no input under 0.01, or none at or above'),
        'eval.weight_clamp_share': share(p.clamped, p.weights, 'no sampled agent after burn-in'),
        'eval.rare_input_saturation_jump': jump,
        'eval.sigma_mean':
            observer.sigma === undefined
                ? none('the policy has no sigma array')
                : share(p.sigmaSum, p.sigmaAgents, 'no alive agent after burn-in'),
    };
}
