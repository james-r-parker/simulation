// Boom and bust, rule 4, and families per basin (natural-selection.md, Detectors and Phase 4 gate):
//
// - `eval.predators_at_end`: the alive `canHunt` agents at the last tick of the run.
// - `eval.prey_types_at_end`: the specialisations that cannot hunt with at least one alive agent at the last tick.
// - `eval.basin_lineages_alive`, `eval.basin_lineage_effective`: at each 1000-tick checkpoint, per basin (`basinOf`)
//   holding at least `BASIN_MIN_ALIVE` alive agents, the lineages with an alive member and the inverse Simpson index of
//   the lineage shares. Per seed, the smaller of the two basins' means over the checkpoints in the last quarter of the
//   run (the one basin when only one qualifies, `null` when none does).
//
// The checkpoint reuses two maps and grows one log; nothing is allocated per tick.

import { basinOf } from '../sim/eras.js';
import { specParams } from '../sim/spec-params.js';
import { createLog, ensureRoom } from './growable-log.js';
import { none, ok } from './metrics-stats.js';

/** Alive agents a basin needs at a checkpoint for its families to be counted. */
export const BASIN_MIN_ALIVE = 20;

/** The share of the run, counted back from its last tick, whose checkpoints feed the per-basin family metrics. */
export const LAST_SHARE = 0.25;

/** Checkpoint columns: the tick, and per basin the alive count, the lineages alive and the effective lineage count. */
const COLUMNS = ['tick', 'alive0', 'alive1', 'lineages0', 'lineages1', 'effective0', 'effective1'];

/**
 * @returns {{log: import('./growable-log.js').Log, rows: number, counts: Map<number, number>[]}} an empty scene
 */
export function createBalanceScene() {
    return { log: createLog(COLUMNS), rows: 0, counts: [new Map(), new Map()] };
}

/**
 * @param {Map<number, number>} counts alive agents per lineage
 * @returns {number} the inverse Simpson index of the lineage shares, 0 for no agents
 */
export function inverseSimpson(counts) {
    let total = 0;
    let squares = 0;
    for (const n of counts.values()) {
        total += n;
        squares += n * n;
    }
    return squares > 0 ? (total * total) / squares : 0;
}

/**
 * Records one checkpoint: per basin, the alive count, the lineages alive and the effective lineage count.
 * @param {ReturnType<typeof createBalanceScene>} scene the balance scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleBalance(scene, world) {
    const [west, east] = scene.counts;
    west.clear();
    east.clear();
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const counts = basinOf(world, world.x[slot]) === 0 ? west : east;
            counts.set(world.lineageId[slot], (counts.get(world.lineageId[slot]) ?? 0) + 1);
        }
    }
    const row = scene.rows;
    ensureRoom(scene.log, row);
    const log = scene.log;
    log.tick[row] = world.tick;
    for (let basin = 0; basin < 2; basin++) {
        const counts = scene.counts[basin];
        let alive = 0;
        for (const n of counts.values()) {
            alive += n;
        }
        log[`alive${basin}`][row] = alive;
        log[`lineages${basin}`][row] = counts.size;
        log[`effective${basin}`][row] = inverseSimpson(counts);
    }
    scene.rows = row + 1;
}

/**
 * @param {Record<string, any>} scene a scene (`log`, `rows`) whose log has `tick`, `alive<basin>` and
 *   `<column><basin>` columns (this one and `scene-families.js`)
 * @param {string} column the per-basin column
 * @param {number} lastTick the run's last tick
 * @returns {import('./metrics-stats.js').MetricResult} the smaller basin mean over the last quarter's checkpoints
 */
export function lastQuarterBasinMean(scene, column, lastTick) {
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
 * @param {Record<string, any>} world the world at the last tick
 * @returns {{predators: number, preyTypes: number}} the alive hunters and the prey types with an alive agent
 */
function endState(world) {
    let predators = 0;
    let preyMask = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const hunts = specParams(world.config, world.spec[slot]).canHunt;
            predators += hunts ? 1 : 0;
            preyMask |= hunts ? 0 : 1 << world.spec[slot];
        }
    }
    let preyTypes = 0;
    for (let mask = preyMask; mask !== 0; mask &= mask - 1) {
        preyTypes += 1;
    }
    return { predators, preyTypes };
}

/**
 * @param {ReturnType<typeof createBalanceScene>} scene the balance scene
 * @param {Record<string, any>} world the world at the run's last tick; one without agents (a bare metrics world)
 *   reads `null` for the end state
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four balance metrics
 */
export function balanceMetrics(scene, world) {
    const lastTick = world.tick ?? 0;
    const families = {
        'eval.basin_lineages_alive': lastQuarterBasinMean(scene, 'lineages', lastTick),
        'eval.basin_lineage_effective': lastQuarterBasinMean(scene, 'effective', lastTick),
    };
    if (world.alive === undefined) {
        const reason = none('no world at the last tick');
        return { 'eval.predators_at_end': reason, 'eval.prey_types_at_end': reason, ...families };
    }
    const { predators, preyTypes } = endState(world);
    return { 'eval.predators_at_end': ok(predators), 'eval.prey_types_at_end': ok(preyTypes), ...families };
}
