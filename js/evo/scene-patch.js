// Leave a dying patch (natural-selection.md, Detectors): of the agents standing inside a patch whose stock is under
// half of `foodPatchCapacity` at a 100-tick sample (the `sampleVisits` cadence), the share still inside that patch 300
// ticks later (`eval.patch_stay_depleted`, lower) and the share outside it by then (`eval.patch_leave_depleted`,
// higher). An agent that died or was replaced in the 300 ticks is left out of both. Samples count from `BURN_IN_TICKS`.
// One pending sample per slot; nothing is allocated after creation.

import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';

/** Ticks between the sample that finds an agent in a depleted patch and the one that reads where it is. */
export const PATCH_STAY_TICKS = 300;

/** A patch is depleted when its stock is under this share of `foodPatchCapacity`. */
export const DEPLETED_SHARE = 0.5;

const NONE = -1;

/** The direction of each patch metric. */
export const PATCH_DIRECTIONS = Object.freeze({
    'eval.patch_stay_depleted': 'lower',
    'eval.patch_leave_depleted': 'higher',
});

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: per slot the pending patch, genome and sample tick, and the counts
 */
export function createPatchScene(config) {
    const n = config.maxAgents;
    return {
        patch: new Int16Array(n).fill(NONE),
        genome: new Uint32Array(n),
        since: new Float64Array(n),
        stay: 0,
        leave: 0,
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {number} the patch whose disc strictly contains the agent (the nearest centre, lowest index on ties, as
 *   `depletePatchAt` picks), or -1
 */
export function patchAt(world, slot) {
    const { patchX, patchY } = world;
    const radius = world.config.foodPatchRadius;
    let best = NONE;
    let bestSq = radius * radius;
    for (let p = 0; p < patchX.length; p++) {
        const dx = world.x[slot] - patchX[p];
        const dy = world.y[slot] - patchY[p];
        const sq = dx * dx + dy * dy;
        if (sq < bestSq) {
            bestSq = sq;
            best = p;
        }
    }
    return best;
}

/**
 * Forgets a slot's pending sample (a birth or death in the slot).
 * @param {Record<string, any>} scene the patch scene
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetPatchSlot(scene, slot) {
    scene.patch[slot] = NONE;
}

/**
 * Reads a pending sample that is `PATCH_STAY_TICKS` old: the agent is still in the patch (stay) or not (leave).
 * @param {Record<string, any>} scene the patch scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot with a pending sample
 * @returns {void}
 */
function resolve(scene, world, slot) {
    if (world.tick - scene.since[slot] < PATCH_STAY_TICKS) {
        return;
    }
    if (patchAt(world, slot) === scene.patch[slot]) {
        scene.stay += 1;
    } else {
        scene.leave += 1;
    }
    scene.patch[slot] = NONE;
}

/**
 * Opens a sample for an agent standing in a depleted patch.
 * @param {Record<string, any>} scene the patch scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot with no pending sample
 * @returns {void}
 */
function open(scene, world, slot) {
    const patch = patchAt(world, slot);
    const { foodPatchCapacity } = world.config;
    if (patch !== NONE && world.patchStock[patch] < DEPLETED_SHARE * foodPatchCapacity) {
        scene.patch[slot] = patch;
        scene.genome[slot] = world.genomeId[slot];
        scene.since[slot] = world.tick;
    }
}

/**
 * Runs one 100-tick sample: resolves the samples that are old enough, then opens new ones at or after burn-in.
 * @param {Record<string, any>} scene the patch scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function samplePatches(scene, world) {
    if (world.patchX.length === 0) {
        return;
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        const alive = world.alive[slot] === 1;
        if (scene.patch[slot] !== NONE && (!alive || world.genomeId[slot] !== scene.genome[slot])) {
            scene.patch[slot] = NONE;
        }
        if (!alive) {
            continue;
        }
        if (scene.patch[slot] !== NONE) {
            resolve(scene, world, slot);
        }
        if (scene.patch[slot] === NONE && world.tick >= BURN_IN_TICKS) {
            open(scene, world, slot);
        }
    }
}

/**
 * @param {Record<string, any>} scene the patch scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two patch metrics, `null` with a reason
 *   when no sample resolved
 */
export function patchMetrics(scene) {
    const total = scene.stay + scene.leave;
    const empty = none('no depleted-patch sample resolved after burn-in');
    return {
        'eval.patch_stay_depleted': total > 0 ? ok(scene.stay / total) : empty,
        'eval.patch_leave_depleted': total > 0 ? ok(scene.leave / total) : empty,
    };
}
