// Kin proximity of juvenile hunters (hunter-learning.md, Detectors). The `kin` channel covers parents, children and siblings, so
// the kin floor of the hunter reflex pulls a juvenile towards any kin; this scene shows towards which. Sampled at the 1000-tick
// checkpoints after burn-in, over the living juvenile hunters (`canHunt`, `ageTicks` below `juvenileTicks`) that have both a
// living parent and a living sibling (same `parentA` and `parentB`, the parents not 0):
//
// - `eval.juvenile_parent_distance`: their mean distance to their nearest living parent.
// - `eval.juvenile_sibling_distance`: their mean distance to their living siblings (each juvenile's mean over its siblings).
// - `eval.juvenile_parent_pull`: the second over the first. Above 1 the juveniles stay nearer a parent than their siblings; near
//   1 the pull is a pull towards any kin.
//
// All three are `watch`, and `null` with a reason when no juvenile had both at a checkpoint. The juvenile list is a preallocated
// scratch and the checkpoint allocates nothing.

import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { BASIN_CHECKPOINT_TICKS } from './scene-basin.js';
import { slotOfGenome } from '../sim/merit-state.js';

/** The direction of each metric of this module. */
export const KIN_DIRECTIONS = Object.freeze({
    'eval.juvenile_parent_distance': 'watch',
    'eval.juvenile_sibling_distance': 'watch',
    'eval.juvenile_parent_pull': 'watch',
});

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`)
 * @returns {Record<string, any>} an empty kin-proximity scene: the juvenile scratch list and the sums of the parent and sibling
 *   distances over the juveniles sampled
 */
export function createKinProximityScene(config) {
    return { juveniles: new Int32Array(config.maxAgents), parentSum: 0, siblingSum: 0, count: 0 };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} a a slot
 * @param {number} b a slot
 * @returns {number} the centre distance between the two
 */
function distance(world, a, b) {
    const dx = world.x[a] - world.x[b];
    const dy = world.y[a] - world.y[b];
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a juvenile
 * @returns {number} the distance to its nearest living parent, or -1 when neither is alive
 */
function parentDistance(world, slot) {
    const a = slotOfGenome(world, world.parentA[slot]);
    const b = slotOfGenome(world, world.parentB[slot]);
    if (a < 0 || b < 0) {
        return a < 0 && b < 0 ? -1 : distance(world, slot, a < 0 ? b : a);
    }
    return Math.min(distance(world, slot, a), distance(world, slot, b));
}

/**
 * @param {Record<string, any>} world the world
 * @param {Int32Array} list the sampled juveniles
 * @param {{count: number, index: number}} at how many are listed and the index of the juvenile
 * @returns {number} the juvenile's mean distance to the listed juveniles of the same parents, or -1 when it has none
 */
function siblingDistance(world, list, { count, index }) {
    const slot = list[index];
    let sum = 0;
    let siblings = 0;
    for (let i = 0; i < count; i++) {
        const other = list[i];
        if (
            i !== index &&
            world.parentA[other] === world.parentA[slot] &&
            world.parentB[other] === world.parentB[slot]
        ) {
            sum += distance(world, slot, other);
            siblings += 1;
        }
    }
    return siblings === 0 ? -1 : sum / siblings;
}

/**
 * Lists the living juvenile hunters that have named parents into the scene's scratch.
 * @param {Record<string, any>} scene the kin-proximity scene
 * @param {Record<string, any>} world the world
 * @returns {number} the juveniles listed
 */
function listJuveniles(scene, world) {
    let count = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        const juvenile =
            world.alive[slot] === 1 &&
            world.huntBySpec[world.spec[slot]] === 1 &&
            world.ageTicks[slot] < world.config.juvenileTicks &&
            world.parentA[slot] !== 0;
        if (juvenile) {
            scene.juveniles[count++] = slot;
        }
    }
    return count;
}

/**
 * Takes the checkpoint at the world's tick, if it is a 1000-tick checkpoint after burn-in.
 * @param {Record<string, any>} scene the kin-proximity scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleKinProximity(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % BASIN_CHECKPOINT_TICKS !== 0) {
        return;
    }
    const count = listJuveniles(scene, world);
    for (let index = 0; index < count; index++) {
        const parent = parentDistance(world, scene.juveniles[index]);
        const sibling = parent < 0 ? -1 : siblingDistance(world, scene.juveniles, { count, index });
        if (sibling >= 0) {
            scene.parentSum += parent;
            scene.siblingSum += sibling;
            scene.count += 1;
        }
    }
}

/**
 * @param {Record<string, any>} scene the kin-proximity scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three kin-proximity metrics
 */
export function kinProximityMetrics(scene) {
    if (scene.count === 0) {
        const reason = none('no juvenile hunter with a living parent and a living sibling at a checkpoint');
        return Object.fromEntries(Object.keys(KIN_DIRECTIONS).map((name) => [name, reason]));
    }
    const parent = scene.parentSum / scene.count;
    const sibling = scene.siblingSum / scene.count;
    return {
        'eval.juvenile_parent_distance': ok(parent),
        'eval.juvenile_sibling_distance': ok(sibling),
        'eval.juvenile_parent_pull': parent > 0 ? ok(sibling / parent) : none('the juveniles stand on their parents'),
    };
}
