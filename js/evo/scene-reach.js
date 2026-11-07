// How far prey live from cover (habitat-cover.md, Detectors). Every 10 ticks after burn-in, each alive non-hunting
// agent is read against the refuge rings and the living food patches:
//
// - `eval.prey_cover_distance`: the median distance to the nearest ring edge, 0 inside one (intended lower).
// - `eval.prey_within_dash_share`: the share of samples within `DASH_PX` of a ring edge (intended higher).
// - `eval.prey_in_patch_share`: the share of samples inside a living food patch disc, the control that says where prey
//   live, so a move in the first two is read against it.
//
// The two ring metrics are `null` when the layout has no rings. All three are instruments (`watch`); none is a reward.
// The distance is kept in `DISTANCE_BIN_PX` bins, so the median is exact to a bin; nothing is allocated per sample.

import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { patchAt } from './scene-patch.js';
import { refugeCentres, ringDistance } from './scene-terrain.js';

/** A flight covers about 300 px; twice that is "within a dash" of cover. */
export const DASH_PX = 600;

/** Fewest prey samples after burn-in the three metrics need. */
export const MIN_REACH_SAMPLES = 100;

/** Width of a distance bin in px; the median is exact to this. */
export const DISTANCE_BIN_PX = 25;

/** Bins: distances of 16,384 px and more share the last. */
const DISTANCE_BINS = 656;

/**
 * @returns {Record<string, any>} an empty reach scene
 */
export function createReachScene() {
    return {
        samples: 0,
        inside: 0,
        withinDash: 0,
        inPatch: 0,
        distance: new Uint32Array(DISTANCE_BINS),
        hasRings: false,
    };
}

/**
 * Runs one 10-tick sample at or after burn-in.
 * @param {Record<string, any>} scene the reach scene
 * @param {Record<string, any>} observer the observer, with its intent state current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleReach(scene, observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const terrain = observer.scenes.terrain;
    scene.hasRings = refugeCentres(terrain, world).length > 0;
    const { hunterSpec } = observer.intent;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1 || hunterSpec[world.spec[slot]] === 1) {
            continue;
        }
        scene.samples += 1;
        scene.inPatch += patchAt(world, slot) >= 0 ? 1 : 0;
        if (!scene.hasRings) {
            continue;
        }
        const d = ringDistance(terrain, world, world.x[slot], world.y[slot]);
        if (d === 0) {
            scene.inside += 1;
        } else {
            scene.distance[Math.min(DISTANCE_BINS - 1, Math.floor(d / DISTANCE_BIN_PX))] += 1;
        }
        scene.withinDash += d <= DASH_PX ? 1 : 0;
    }
}

/**
 * @param {Record<string, any>} scene the reach scene
 * @returns {number} the median distance to a ring edge, to a bin; 0 when half the samples are inside a ring
 */
function medianDistance(scene) {
    if (2 * scene.inside >= scene.samples) {
        return 0;
    }
    let seen = scene.inside;
    for (let bin = 0; bin < DISTANCE_BINS; bin++) {
        seen += scene.distance[bin];
        if (2 * seen >= scene.samples) {
            return bin * DISTANCE_BIN_PX;
        }
    }
    return (DISTANCE_BINS - 1) * DISTANCE_BIN_PX;
}

/**
 * @param {Record<string, any>} scene the reach scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three reach metrics
 */
export function reachMetrics(scene) {
    const few = `fewer than ${MIN_REACH_SAMPLES} prey samples after burn-in`;
    const enough = scene.samples >= MIN_REACH_SAMPLES;
    const ring = (/** @type {() => number} */ read) => {
        if (!enough) {
            return none(few);
        }
        return scene.hasRings ? ok(read()) : none('no refuge rings');
    };
    return {
        'eval.prey_cover_distance': ring(() => medianDistance(scene)),
        'eval.prey_within_dash_share': ring(() => scene.withinDash / scene.samples),
        'eval.prey_in_patch_share': enough ? ok(scene.inPatch / scene.samples) : none(few),
    };
}
