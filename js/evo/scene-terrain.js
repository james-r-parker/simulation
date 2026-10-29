// Refuge and cross or stay (natural-selection.md, Detectors), both read from the terrain the `basins` layout builds.
//
// - `eval.refuge_use_under_threat`: every 10 ticks, the share of threatened agents (a "can bite me" ray hit at
//   proximity `THREAT_PROXIMITY` or more) inside a refuge ring, minus the same share for unthreatened agents.
// - `eval.gap_crossers`, `eval.gap_never_share`: every 10 ticks each agent's side of the wall line is compared with
//   its side at the sample before; a change is a crossing. Per lineage with `MIN_LINEAGE_SAMPLES` agent-samples or
//   more: the mean crossings, and the share of those lineages with none.
//
// The refuge centres are read once from the rocks the terrain writes (the last `refugeCount x REFUGE_ROCKS` obstacle
// slots, eight rocks to a ring). Samples count from `BURN_IN_TICKS`. Nothing is allocated per sample but a Map entry
// the first time a lineage is seen.

import { REFUGE_ROCKS, ringRadius, terrainRockCount } from '../sim/terrain.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './observer-events.js';
import { THREAT_PROXIMITY } from './observer-intent-state.js';
import { createKeyed, rowOf } from './scene-keyed.js';

/** Fewest agent-samples a lineage needs for the crossing metrics. */
export const MIN_LINEAGE_SAMPLES = 20;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: the refuge centres (read at the first sample), the four refuge
 *   counts, each slot's last wall side and the per-lineage sample and crossing counts
 */
export function createTerrainScene(config) {
    const n = config.maxAgents;
    return {
        centres: /** @type {Float64Array | undefined} */ (undefined),
        threatened: 0,
        threatenedIn: 0,
        calm: 0,
        calmIn: 0,
        sideGenome: new Uint32Array(n),
        side: new Uint8Array(n),
        lineages: createKeyed(['samples', 'crossings']),
    };
}

/**
 * The refuge centres: each ring's eight rocks sit on a circle round it, so it is their mean.
 * @param {Record<string, any>} scene the terrain scene
 * @param {Record<string, any>} world the world
 * @returns {Float64Array} x, y per refuge; empty when the layout has none
 */
export function refugeCentres(scene, world) {
    if (scene.centres === undefined) {
        const { config } = world;
        const count = config.refugeCount;
        const centres = new Float64Array(2 * count);
        const first = terrainRockCount(config) - count * REFUGE_ROCKS;
        for (let i = 0; i < count; i++) {
            for (let r = 0; r < REFUGE_ROCKS; r++) {
                centres[2 * i] += world.obsX[first + i * REFUGE_ROCKS + r] / REFUGE_ROCKS;
                centres[2 * i + 1] += world.obsY[first + i * REFUGE_ROCKS + r] / REFUGE_ROCKS;
            }
        }
        scene.centres = centres;
    }
    return scene.centres;
}

/**
 * @param {Record<string, any>} scene the terrain scene
 * @param {Record<string, any>} world the world
 * @param {number} x a point
 * @param {number} y a point
 * @returns {number} the distance from the point to the nearest refuge ring's edge, 0 inside one; Infinity with none
 */
export function ringDistance(scene, world, x, y) {
    const centres = refugeCentres(scene, world);
    const radius = ringRadius(world.config);
    let best = Infinity;
    for (let i = 0; i < centres.length; i += 2) {
        const dx = x - centres[i];
        const dy = y - centres[i + 1];
        best = Math.min(best, Math.max(0, Math.sqrt(dx * dx + dy * dy) - radius));
    }
    return best;
}

/**
 * @param {Record<string, any>} scene the terrain scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {boolean} whether the agent's centre is inside a refuge ring
 */
export function inRefuge(scene, world, slot) {
    return ringDistance(scene, world, world.x[slot], world.y[slot]) === 0;
}

/**
 * Counts one agent's side of the wall line, and a crossing when it changed since the last sample of the same genome.
 * @param {Record<string, any>} scene the terrain scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function sampleSide(scene, world, slot) {
    const side = world.x[slot] < world.config.worldWidth / 2 ? 0 : 1;
    const crossed = scene.sideGenome[slot] === world.genomeId[slot] && scene.side[slot] !== side;
    scene.sideGenome[slot] = world.genomeId[slot];
    scene.side[slot] = side;
    const table = scene.lineages;
    const row = rowOf(table, world.lineageId[slot]);
    table.log.samples[row] += 1;
    table.log.crossings[row] += crossed ? 1 : 0;
}

/**
 * Runs one 10-tick sample at or after burn-in.
 * @param {Record<string, any>} scene the terrain scene
 * @param {Record<string, any>} observer the observer, with its intent state current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleTerrain(scene, observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { threatProx } = observer.intent;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        const inside = inRefuge(scene, world, slot) ? 1 : 0;
        if (threatProx[slot] >= THREAT_PROXIMITY) {
            scene.threatened += 1;
            scene.threatenedIn += inside;
        } else {
            scene.calm += 1;
            scene.calmIn += inside;
        }
        sampleSide(scene, world, slot);
    }
}

/**
 * @param {Record<string, any>} scene the terrain scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the refuge and the two gap metrics
 */
export function terrainMetrics(scene) {
    const refuge =
        scene.threatened > 0 && scene.calm > 0
            ? ok(scene.threatenedIn / scene.threatened - scene.calmIn / scene.calm)
            : none('no threatened and unthreatened sample after burn-in');
    const { rows, log } = scene.lineages;
    let lineages = 0;
    let crossings = 0;
    let never = 0;
    for (let row = 0; row < rows; row++) {
        if (log.samples[row] >= MIN_LINEAGE_SAMPLES) {
            lineages += 1;
            crossings += log.crossings[row];
            never += log.crossings[row] === 0 ? 1 : 0;
        }
    }
    const noLineage = none(`no lineage with ${MIN_LINEAGE_SAMPLES} wall samples after burn-in`);
    return {
        'eval.refuge_use_under_threat': refuge,
        'eval.gap_crossers': lineages > 0 ? ok(crossings / lineages) : noLineage,
        'eval.gap_never_share': lineages > 0 ? ok(never / lineages) : noLineage,
    };
}
