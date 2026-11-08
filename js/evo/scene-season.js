// Season changes the map (natural-selection.md, Detectors), read at the 1000-tick checkpoints from `BURN_IN_TICKS` on the
// basins world (winter is the era season `WINTER`):
//
// - `eval.winter_basin_density`: per basin, the mean alive count at winter checkpoints over the mean at the other
//   checkpoints; the mean of the two basins' ratios.
// - `eval.winter_shelter_distance`: the mean distance of an alive agent to the nearest refuge ring edge or cold-margin
//   edge (the two lines `y = coldMarginWidth` and `y = worldHeight - coldMarginWidth`) at winter checkpoints, minus the
//   same mean at the other checkpoints (negative when agents move towards shelter in winter).
//
// Seasonal-movement.md adds two, read in the same pass (winter group against the other checkpoints):
//
// - `eval.winter_band_shift`: the share of alive agents inside the cold margin, winter minus the others (negative when
//   agents leave the snowline in winter). The margin is `snowMarginWidth` when the config has that key (seasonal-movement.md
//   T8) and `coldMarginWidth` until then.
// - `eval.winter_patch_proximity`: the share of alive agents within `foodPatchRadius` of an alive patch with positive
//   weight, winter minus the others (higher when winter concentrates on the patches that fruit).
//
// Sums only; nothing is allocated.

import { WINTER } from '../sim/eras.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { ringDistance } from './scene-terrain.js';

/**
 * @returns {Record<string, any>} an empty scene: per season group (0 winter, 1 other) the checkpoints, the alive
 *   counts per basin, the agents sampled and their summed shelter distance
 */
export function createSeasonScene() {
    return {
        checkpoints: new Float64Array(2),
        basin: new Float64Array(4),
        agents: new Float64Array(2),
        distance: new Float64Array(2),
        inMargin: new Float64Array(2),
        nearFruit: new Float64Array(2),
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {number} the width of the cold margin a winter shelter or band is read against
 */
function marginWidth(config) {
    return config.snowMarginWidth ?? config.coldMarginWidth;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {boolean} whether the agent is within `foodPatchRadius` of an alive patch with positive weight
 */
function nearFruitingPatch(world, slot) {
    const radius = world.config.foodPatchRadius;
    for (let p = 0; p < world.patchX.length; p++) {
        if (world.patchAlive[p] === 1 && world.patchWeight[p] > 0) {
            const dx = world.x[slot] - world.patchX[p];
            const dy = world.y[slot] - world.patchY[p];
            if (dx * dx + dy * dy <= radius * radius) {
                return true;
            }
        }
    }
    return false;
}

/**
 * @param {Record<string, any>} terrain the terrain scene (it holds the refuge centres)
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {number} the distance to the nearest refuge ring edge or cold-margin edge
 */
function shelterDistance(terrain, world, slot) {
    const width = marginWidth(world.config);
    const y = world.y[slot];
    const margin = Math.min(Math.abs(y - width), Math.abs(y - (world.config.worldHeight - width)));
    return Math.min(margin, ringDistance(terrain, world, world.x[slot], y));
}

/**
 * Runs one checkpoint (call when the tick divides by 1000); does nothing before burn-in.
 * @param {Record<string, any>} scene the season scene
 * @param {Record<string, any>} terrain the terrain scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleSeason(scene, terrain, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const group = world.season[0] === WINTER ? 0 : 1;
    scene.checkpoints[group] += 1;
    const half = world.config.worldWidth / 2;
    const width = marginWidth(world.config);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            scene.basin[group * 2 + (world.x[slot] < half ? 0 : 1)] += 1;
            scene.agents[group] += 1;
            scene.distance[group] += shelterDistance(terrain, world, slot);
            const y = world.y[slot];
            scene.inMargin[group] += y < width || y > world.config.worldHeight - width ? 1 : 0;
            scene.nearFruit[group] += nearFruitingPatch(world, slot) ? 1 : 0;
        }
    }
}

/**
 * @param {Record<string, any>} scene the season scene
 * @returns {import('./metrics-stats.js').MetricResult} the mean over basins of winter density over other density
 */
function density(scene) {
    if (scene.checkpoints[0] === 0 || scene.checkpoints[1] === 0) {
        return none('no winter checkpoint and no other checkpoint after burn-in with eras on');
    }
    let sum = 0;
    let basins = 0;
    for (let b = 0; b < 2; b++) {
        const other = scene.basin[2 + b] / scene.checkpoints[1];
        if (other > 0) {
            sum += scene.basin[b] / scene.checkpoints[0] / other;
            basins += 1;
        }
    }
    return basins > 0 ? ok(sum / basins) : none('no agent in either basin outside winter');
}

/**
 * @param {Record<string, any>} scene the season scene
 * @returns {import('./metrics-stats.js').MetricRecord} the four season metrics
 */
export function seasonMetrics(scene) {
    const sampled = scene.agents[0] > 0 && scene.agents[1] > 0;
    const winter = scene.distance[0] / scene.agents[0];
    const other = scene.distance[1] / scene.agents[1];
    return {
        'eval.winter_basin_density': density(scene),
        'eval.winter_shelter_distance': sampled
            ? ok(winter - other)
            : none('no winter and no other checkpoint with an alive agent after burn-in'),
        'eval.winter_band_shift': sampled
            ? ok(scene.inMargin[0] / scene.agents[0] - scene.inMargin[1] / scene.agents[1])
            : none('no winter and no other checkpoint with an alive agent after burn-in'),
        'eval.winter_patch_proximity': sampled
            ? ok(scene.nearFruit[0] / scene.agents[0] - scene.nearFruit[1] / scene.agents[1])
            : none('no winter and no other checkpoint with an alive agent after burn-in'),
    };
}
