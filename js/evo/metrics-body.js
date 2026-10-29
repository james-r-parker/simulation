// The body and sex metrics (fitness-and-selection.md, New metrics): how spread the evolvable traits are, how much of
// the size x vision plane the population occupies, and how far the sexes sit from even. `sampleBody` runs once per
// checkpoint at or after burn-in and adds to run-long sums in `observer.body` (outside `observer.series`, which the
// worker drains); the metrics read those sums at report time. Nothing here runs per tick or allocates.

import { TRAIT_SPAN } from '../sim/traits.js';
import { SEX } from '../sim/sex.js';
import { none, ok } from './metrics-stats.js';

/** The body-plan grid is this many bins on each of the size and vision traits. */
export const GRID_BINS = 5;

const NO_SEXES = 'sexesEnabled is off';
const NO_SPREAD = 'no checkpoint after burn-in with 2 alive agents';
const NO_SAMPLE = 'no checkpoint after burn-in with an alive agent';

/**
 * @returns {{sampled: number, spreadSum: number, spreadCount: number, cells: Uint8Array, sexSum: number}} empty body
 *   pools: checkpoints with an alive agent, the summed per-checkpoint trait CV and its checkpoints (those with 2
 *   agents), the occupied size x vision cells, and the summed per-checkpoint sex imbalance
 */
export function createBodyPools() {
    return { sampled: 0, spreadSum: 0, spreadCount: 0, cells: new Uint8Array(GRID_BINS * GRID_BINS), sexSum: 0 };
}

/**
 * @param {number} multiplier a trait as a multiple of its default, in `[1 - TRAIT_SPAN, 1 + TRAIT_SPAN]`
 * @returns {number} its bin, `0` to `GRID_BINS - 1`, over equal slices of that range
 */
function binOf(multiplier) {
    const bin = Math.floor(((multiplier - (1 - TRAIT_SPAN)) / (2 * TRAIT_SPAN)) * GRID_BINS);
    return Math.min(GRID_BINS - 1, Math.max(0, bin));
}

/**
 * @param {number} sum the sum of n values
 * @param {number} sumSq the sum of their squares
 * @param {number} n the count, at least 2
 * @returns {number} the coefficient of variation (population sd over mean)
 */
function variation(sum, sumSq, n) {
    const m = sum / n;
    return Math.sqrt(Math.max(0, sumSq / n - m * m)) / m;
}

/**
 * Adds one checkpoint's alive agents to the body pools: the mean coefficient of variation of the size, vision and
 * child-share traits (needs 2 agents), the occupied cells, and the female share's distance from 0.5. A feature that
 * is off adds nothing.
 * @param {ReturnType<typeof createBodyPools>} pools the pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleBody(pools, world) {
    const { config, baseSize, vision, childShare, sex, alive } = world;
    let n = 0;
    let females = 0;
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let q0 = 0;
    let q1 = 0;
    let q2 = 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            n++;
            females += sex[slot] === SEX.FEMALE ? 1 : 0;
            s0 += baseSize[slot];
            q0 += baseSize[slot] * baseSize[slot];
            s1 += vision[slot];
            q1 += vision[slot] * vision[slot];
            s2 += childShare[slot];
            q2 += childShare[slot] * childShare[slot];
            pools.cells[binOf(baseSize[slot] / config.baseSize) * GRID_BINS + binOf(vision[slot])] = 1;
        }
    }
    if (n === 0) {
        return;
    }
    pools.sampled++;
    pools.sexSum += Math.abs(females / n - 0.5);
    if (n >= 2) {
        pools.spreadSum += (variation(s0, q0, n) + variation(s1, q1, n) + variation(s2, q2, n)) / 3;
        pools.spreadCount++;
    }
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed during the run
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three body metrics, keyed by name; each
 *   `null` with a reason when its feature is off or no checkpoint at or after burn-in had the agents it needs
 */
export function bodyMetrics(observer) {
    const { sampled, spreadSum, spreadCount, cells, sexSum } = observer.body;
    const { sexesEnabled } = observer.config;
    let occupied = 0;
    for (let i = 0; i < cells.length; i++) {
        occupied += cells[i];
    }
    const spread = spreadCount === 0 ? none(NO_SPREAD) : ok(spreadSum / spreadCount);
    const coverage = sampled === 0 ? none(NO_SAMPLE) : ok(occupied / cells.length);
    const balance = sampled === 0 ? none(NO_SAMPLE) : ok(sexSum / sampled);
    return {
        'eval.trait_spread': spread,
        'eval.body_plan_coverage': coverage,
        'eval.sex_balance': sexesEnabled ? balance : none(NO_SEXES),
    };
}
