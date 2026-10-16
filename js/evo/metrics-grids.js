// The behaviour grids: occupied fraction of a 10 x 10 grid over up to 300 mature deaths drawn from the eval stream.

import { nextInt } from '../sim/rng.js';
import { none, ok } from './metrics-stats.js';

/** Most deaths binned. */
export const GRID_SAMPLE = 300;
/** Bins per grid axis. */
export const GRID_BINS = 10;
/** The life grid's y axis spans 0 to this many children per 10000 ticks alive; the top bin is open-ended. */
export const CHILDREN_RANGE = 5;

/**
 * @param {number} v a value scaled to 0..1 (above 1 lands in the top bin)
 * @returns {number} the bin, `min(9, floor(v * 10))`, 0 for negatives and NaN
 */
export function bin(v) {
    return v > 0 ? Math.min(GRID_BINS - 1, Math.floor(v * GRID_BINS)) : 0;
}

/**
 * Deaths that reached `maturityTicks` and have at least one sample, drawn without replacement (partial Fisher-Yates
 * with `nextInt` on `observer.rng`): `min(GRID_SAMPLE, n)` death rows. Draws nothing when there are none.
 * @param {Record<string, any>} observer the observer
 * @returns {Int32Array} death-log row indices
 */
export function sampleDeaths(observer) {
    const { deaths, deathCount, config } = observer;
    /** @type {number[]} */
    const eligible = [];
    for (let i = 0; i < deathCount; i++) {
        if (deaths.ageTicks[i] >= config.maturityTicks && deaths.samples[i] > 0) {
            eligible.push(i);
        }
    }
    const take = Math.min(GRID_SAMPLE, eligible.length);
    for (let i = 0; i < take; i++) {
        const j = i + nextInt(observer.rng, eligible.length - i);
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    return Int32Array.from(eligible.slice(0, take));
}

/**
 * @param {Record<string, any>} deaths the death log
 * @param {number} row a death row with samples
 * @returns {[number, number]} the life grid's x and y bins
 */
function lifeBins(deaths, row) {
    const gained = deaths.foodEnergy[row] + deaths.biteEnergy[row];
    const share = gained > 0 ? deaths.biteEnergy[row] / gained : 0;
    const perTenK = deaths.ageTicks[row] > 0 ? (deaths.children[row] / deaths.ageTicks[row]) * 10000 : 0;
    return [bin(share), bin(perTenK / CHILDREN_RANGE)];
}

/**
 * @param {Record<string, any>} deaths the death log
 * @param {number} row a death row with samples
 * @returns {[number, number]} the motion grid's x and y bins
 */
function motionBins(deaths, row) {
    const n = deaths.samples[row];
    return [bin(Math.min(1, deaths.speedSum[row] / n)), bin(Math.min(1, deaths.turnSum[row] / n))];
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {{life: import('./metrics-stats.js').MetricResult, motion: import('./metrics-stats.js').MetricResult}}
 *   the occupied fraction of the life grid and of the motion grid over the same sampled deaths
 */
export function behaviourCoverage(observer) {
    const rows = sampleDeaths(observer);
    if (rows.length === 0) {
        return { life: none('no sampled mature death'), motion: none('no sampled mature death') };
    }
    const life = new Uint8Array(GRID_BINS * GRID_BINS);
    const motion = new Uint8Array(GRID_BINS * GRID_BINS);
    for (const row of rows) {
        const [lx, ly] = lifeBins(observer.deaths, row);
        const [mx, my] = motionBins(observer.deaths, row);
        life[lx * GRID_BINS + ly] = 1;
        motion[mx * GRID_BINS + my] = 1;
    }
    const cells = GRID_BINS * GRID_BINS;
    const count = (/** @type {Uint8Array} */ grid) => grid.reduce((a, b) => a + b, 0) / cells;
    return { life: ok(count(life)), motion: ok(count(motion)) };
}
