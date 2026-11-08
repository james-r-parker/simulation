// Basin divergence (natural-selection T59): do the two basins hold different populations? It replaces the per-basin
// families watch (`eval.basin_lineage_effective`, `eval.basin_family_effective`), which counted how many families each
// basin held but not whether the basins differ from each other. Read it beside `eval.predator_end_local_share`: a
// high divergence with a high local share is two basins that bred apart; a high divergence with a low share is the
// floor placing different stock in each.
//
// At each 1000-tick checkpoint (`sampleDivergence`) every alive agent is counted into its basin (`basinOf`):
// - by specialisation, giving one share vector per basin;
// - by genetic cluster: agents are clustered across both basins in slot order, each joining the first family whose
//   founder lies within `FAMILY_DISTANCE` (`geneticDistance`), else founding one; each basin's family shares are a
//   vector over those families.
// The distance is the total variation distance between the two basins' share vectors, half the sum of the absolute
// differences: 0 when the basins hold the same mix, 1 when they share no specialisation or family.
//
// - `eval.basin_spec_divergence`, `eval.basin_cluster_divergence`: the mean distance over the checkpoints in the last
//   quarter of the run where both basins held at least `BASIN_MIN_ALIVE` alive agents; `null` with the basin and its
//   count as the reason when either basin's mean alive count over that quarter is under it, or no checkpoint
//   qualified.
// - `eval.basin_divergence`: the mean of the two. All three are `watch` metrics, higher meaning more distinct basins.
//
// The counts live in arrays sized once from `maxAgents` and the specialisation table; a checkpoint allocates nothing.

import { basinOf } from '../sim/eras.js';
import { geneticDistance } from '../sim/genetics.js';
import { createLog, ensureRoom } from './growable-log.js';
import { none, ok } from './metrics-stats.js';
import { BASIN_MIN_ALIVE, basinMean, LAST_SHARE } from './scene-balance.js';
import { FAMILY_DISTANCE } from './scene-families.js';

const COLUMNS = ['tick', 'alive0', 'alive1', 'spec', 'cluster'];

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: the log, and the scratch counts of one checkpoint
 */
export function createDivergenceScene(config) {
    const specs = Object.keys(config.specialisations).length;
    return {
        log: createLog(COLUMNS),
        rows: 0,
        founders: new Int32Array(config.maxAgents),
        families: [new Float64Array(config.maxAgents), new Float64Array(config.maxAgents)],
        specs: [new Float64Array(specs), new Float64Array(specs)],
        alive: new Float64Array(2),
    };
}

/**
 * @param {Float64Array} a the first basin's counts
 * @param {Float64Array} b the second basin's counts
 * @param {number} length the number of leading entries to compare
 * @param {Float64Array} totals the two basins' totals
 * @returns {number} the total variation distance between the two share vectors
 */
function totalVariation(a, b, length, totals) {
    let sum = 0;
    for (let i = 0; i < length; i++) {
        sum += Math.abs(a[i] / totals[0] - b[i] / totals[1]);
    }
    return sum / 2;
}

/**
 * Records one checkpoint of both basins.
 * @param {Record<string, any>} scene the divergence scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleDivergence(scene, world) {
    const row = scene.rows;
    ensureRoom(scene.log, row);
    scene.families[0].fill(0);
    scene.families[1].fill(0);
    scene.specs[0].fill(0);
    scene.specs[1].fill(0);
    scene.alive.fill(0);
    let count = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        const basin = basinOf(world, world.x[slot]);
        let family = 0;
        while (family < count && geneticDistance(world, scene.founders[family], slot) >= FAMILY_DISTANCE) {
            family += 1;
        }
        if (family === count) {
            scene.founders[count] = slot;
            count += 1;
        }
        scene.families[basin][family] += 1;
        scene.specs[basin][world.spec[slot]] += 1;
        scene.alive[basin] += 1;
    }
    const log = scene.log;
    log.tick[row] = world.tick;
    log.alive0[row] = scene.alive[0];
    log.alive1[row] = scene.alive[1];
    const both = scene.alive[0] > 0 && scene.alive[1] > 0;
    log.spec[row] = both ? totalVariation(scene.specs[0], scene.specs[1], scene.specs[0].length, scene.alive) : 0;
    log.cluster[row] = both ? totalVariation(scene.families[0], scene.families[1], count, scene.alive) : 0;
    scene.rows = row + 1;
}

/**
 * @param {Record<string, any>} scene the divergence scene
 * @param {number} lastTick the run's last tick
 * @returns {string | null} why the basins cannot be compared (a basin's mean alive count over the last quarter is under
 *   `BASIN_MIN_ALIVE`), or `null` when they can
 */
function thinReason(scene, lastTick) {
    const from = lastTick * (1 - LAST_SHARE);
    for (let basin = 0; basin < 2; basin++) {
        const alive = basinMean(scene, `alive${basin}`, basin, { from, floor: 0 });
        if (!(alive >= BASIN_MIN_ALIVE)) {
            const shown = Number.isNaN(alive) ? 0 : Math.round(alive * 10) / 10;
            return `basin ${basin} held ${shown} agents (under ${BASIN_MIN_ALIVE}) in the last quarter`;
        }
    }
    return null;
}

/**
 * @param {Record<string, any>} scene the divergence scene
 * @param {string} column `spec` or `cluster`
 * @param {number} lastTick the run's last tick
 * @returns {number} the mean distance over the last quarter's checkpoints with both basins at the floor, NaN for none
 */
function lastQuarterMean(scene, column, lastTick) {
    const from = lastTick * (1 - LAST_SHARE);
    const log = scene.log;
    let sum = 0;
    let n = 0;
    for (let row = 0; row < scene.rows; row++) {
        if (log.tick[row] >= from && log.alive0[row] >= BASIN_MIN_ALIVE && log.alive1[row] >= BASIN_MIN_ALIVE) {
            sum += log[column][row];
            n += 1;
        }
    }
    return n > 0 ? sum / n : NaN;
}

/**
 * @param {Record<string, any>} scene the divergence scene
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the three divergence metrics
 */
export function divergenceMetrics(scene, world) {
    const lastTick = world.tick ?? 0;
    const reason = thinReason(scene, lastTick);
    const spec = lastQuarterMean(scene, 'spec', lastTick);
    const cluster = lastQuarterMean(scene, 'cluster', lastTick);
    if (reason !== null || Number.isNaN(spec)) {
        const why = reason ?? `no checkpoint in the last quarter had both basins at ${BASIN_MIN_ALIVE} agents`;
        return {
            'eval.basin_spec_divergence': none(why),
            'eval.basin_cluster_divergence': none(why),
            'eval.basin_divergence': none(why),
        };
    }
    return {
        'eval.basin_spec_divergence': ok(spec),
        'eval.basin_cluster_divergence': ok(cluster),
        'eval.basin_divergence': ok((spec + cluster) / 2),
    };
}
