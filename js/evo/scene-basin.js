// Boom and bust, rule 1 (natural-selection.md, Detectors), per basin (west or east of the wall line):
//
// - `eval.basin_pop_cv`: the coefficient of variation of each basin's alive count at the 1000-tick checkpoints from
//   `BURN_IN_TICKS`, averaged over the basins that held anyone.
// - `eval.basin_recolonisations`: the count of basin extinctions (a basin seen at 0, every 10 ticks) followed by
//   `RECOLONISED_MIN` alive agents in it with no entrant spawned into that basin since (a floor or immigrant birth,
//   which includes rescue and invasion births). With immigration and rescue off, the entrants are the guard's only.
//
// Only the `basins` layout has basins; any other layout reads `null`. Per-basin state only; nothing is allocated.

import { BORN_CAUSE } from '../sim/events.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';

/** Alive agents a basin needs after an extinction to count as recolonised. */
export const RECOLONISED_MIN = 5;

/** Ticks between the population samples that feed the coefficient of variation. */
export const BASIN_CHECKPOINT_TICKS = 1000;

/**
 * @returns {Record<string, any>} an empty scene: per basin the extinct and entrant flags, the sums behind the
 *   coefficient of variation, and the recolonisation count
 */
export function createBasinScene() {
    return {
        extinct: new Uint8Array(2),
        entrant: new Uint8Array(2),
        count: new Float64Array(2),
        n: new Float64Array(2),
        sum: new Float64Array(2),
        sumSq: new Float64Array(2),
        recolonised: 0,
    };
}

/**
 * Notes a birth: an entrant (floor or immigrant) into a basin that is extinct taints its recolonisation.
 * @param {Record<string, any>} scene the basin scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, cause: number}} birth the newborn's slot and `BORN_CAUSE`
 * @returns {void}
 */
export function noteBasinBirth(scene, world, { slot, cause }) {
    if (cause !== BORN_CAUSE.FLOOR && cause !== BORN_CAUSE.IMMIGRANT) {
        return;
    }
    const basin = world.x[slot] < world.config.worldWidth / 2 ? 0 : 1;
    scene.entrant[basin] = scene.extinct[basin];
}

/**
 * Moves one basin's extinction state on from its current alive count.
 * @param {Record<string, any>} scene the basin scene
 * @param {number} basin 0 or 1
 * @param {number} tick the observed tick
 * @returns {void}
 */
function follow(scene, basin, tick) {
    const alive = scene.count[basin];
    if (alive === 0) {
        scene.extinct[basin] = 1;
    } else if (scene.extinct[basin] === 1 && (scene.entrant[basin] === 1 || alive >= RECOLONISED_MIN)) {
        scene.recolonised += scene.entrant[basin] === 0 && tick >= BURN_IN_TICKS ? 1 : 0;
        scene.extinct[basin] = 0;
        scene.entrant[basin] = 0;
    }
}

/**
 * Runs one 10-tick sample: the alive count per basin, the extinction state, and on a 1000-tick checkpoint at or after
 * burn-in the sums behind the coefficient of variation.
 * @param {Record<string, any>} scene the basin scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleBasins(scene, world) {
    scene.count.fill(0);
    const half = world.config.worldWidth / 2;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            scene.count[world.x[slot] < half ? 0 : 1] += 1;
        }
    }
    const checkpoint = world.tick >= BURN_IN_TICKS && world.tick % BASIN_CHECKPOINT_TICKS === 0;
    for (let basin = 0; basin < 2; basin++) {
        follow(scene, basin, world.tick);
        if (checkpoint) {
            scene.n[basin] += 1;
            scene.sum[basin] += scene.count[basin];
            scene.sumSq[basin] += scene.count[basin] * scene.count[basin];
        }
    }
}

/**
 * @param {Record<string, any>} scene the basin scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two basin metrics
 */
export function basinMetrics(scene) {
    let cvSum = 0;
    let basins = 0;
    for (let b = 0; b < 2; b++) {
        const mean = scene.n[b] > 0 ? scene.sum[b] / scene.n[b] : 0;
        if (mean > 0) {
            const variance = Math.max(0, scene.sumSq[b] / scene.n[b] - mean * mean);
            cvSum += Math.sqrt(variance) / mean;
            basins += 1;
        }
    }
    return {
        'eval.basin_pop_cv': basins > 0 ? ok(cvSum / basins) : none('no 1000-tick checkpoint after burn-in'),
        'eval.basin_recolonisations': ok(scene.recolonised),
    };
}
