// Families per basin as genetic clusters (natural-selection Phase 4, user 2026-10-31): a maternal line always
// coalesces over a long run, so the gate counts families by genome instead.
//
// - `eval.basin_families`, `eval.basin_family_effective`: at each 1000-tick checkpoint, per basin (`basinOf`) holding
//   at least `BASIN_MIN_ALIVE` alive agents, the agents are clustered in slot order: each joins the first family whose
//   founder lies within `FAMILY_DISTANCE` (`geneticDistance`, about 1.13 between unrelated genomes), else founds one.
//   The count of families and the inverse Simpson index of their sizes; per seed, the smaller of the two basins' means
//   over the checkpoints in the last quarter of the run (the one basin when only one qualifies, `null` when none does).
//
// The founders and sizes live in arrays sized once from `maxAgents`; a checkpoint allocates nothing.

import { basinOf } from '../sim/eras.js';
import { geneticDistance } from '../sim/genetics.js';
import { createLog, ensureRoom } from './growable-log.js';
import { none, ok } from './metrics-stats.js';
import { BASIN_MIN_ALIVE, LAST_SHARE } from './scene-balance.js';

/** Genomes closer than this share a family: under half the distance between two unrelated genomes. */
export const FAMILY_DISTANCE = 0.5;

const COLUMNS = ['tick', 'alive0', 'alive1', 'families0', 'families1', 'effective0', 'effective1'];

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: the log, and the founders and sizes of one basin's families
 */
export function createFamilyScene(config) {
    return {
        log: createLog(COLUMNS),
        rows: 0,
        founders: new Int32Array(config.maxAgents),
        sizes: new Float64Array(config.maxAgents),
    };
}

/**
 * @param {Record<string, any>} scene the family scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an agent of the basin
 * @param {number} count the families founded so far
 * @returns {number} the new family count
 */
function joinFamily(scene, world, slot, count) {
    for (let f = 0; f < count; f++) {
        if (geneticDistance(world, scene.founders[f], slot) < FAMILY_DISTANCE) {
            scene.sizes[f] += 1;
            return count;
        }
    }
    scene.founders[count] = slot;
    scene.sizes[count] = 1;
    return count + 1;
}

/**
 * Clusters one basin and writes its alive count, family count and effective family count into the row.
 * @param {Record<string, any>} scene the family scene
 * @param {Record<string, any>} world the world
 * @param {number} basin 0 or 1
 * @param {number} row the log row
 * @returns {void}
 */
function sampleBasin(scene, world, basin, row) {
    let count = 0;
    let alive = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && basinOf(world, world.x[slot]) === basin) {
            count = joinFamily(scene, world, slot, count);
            alive += 1;
        }
    }
    let squares = 0;
    for (let f = 0; f < count; f++) {
        squares += scene.sizes[f] * scene.sizes[f];
    }
    const log = scene.log;
    log[`alive${basin}`][row] = alive;
    log[`families${basin}`][row] = count;
    log[`effective${basin}`][row] = squares > 0 ? (alive * alive) / squares : 0;
}

/**
 * Records one checkpoint of both basins.
 * @param {Record<string, any>} scene the family scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleFamilies(scene, world) {
    const row = scene.rows;
    ensureRoom(scene.log, row);
    scene.log.tick[row] = world.tick;
    sampleBasin(scene, world, 0, row);
    sampleBasin(scene, world, 1, row);
    scene.rows = row + 1;
}

/**
 * @param {Record<string, any>} scene the family scene
 * @param {'families' | 'effective'} column the per-basin column
 * @param {number} lastTick the run's last tick
 * @returns {import('./metrics-stats.js').MetricResult} the smaller basin mean over the last quarter's checkpoints
 */
function basinMean(scene, column, lastTick) {
    const from = lastTick * (1 - LAST_SHARE);
    let smallest = Infinity;
    for (let basin = 0; basin < 2; basin++) {
        let sum = 0;
        let n = 0;
        for (let row = 0; row < scene.rows; row++) {
            if (scene.log.tick[row] >= from && scene.log[`alive${basin}`][row] >= BASIN_MIN_ALIVE) {
                sum += scene.log[`${column}${basin}`][row];
                n += 1;
            }
        }
        smallest = n > 0 ? Math.min(smallest, sum / n) : smallest;
    }
    return smallest === Infinity ? none(`no basin held ${BASIN_MIN_ALIVE} agents in the last quarter`) : ok(smallest);
}

/**
 * @param {Record<string, any>} scene the family scene
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two family metrics
 */
export function familyMetrics(scene, world) {
    const lastTick = world.tick ?? 0;
    return {
        'eval.basin_families': basinMean(scene, 'families', lastTick),
        'eval.basin_family_effective': basinMean(scene, 'effective', lastTick),
    };
}
