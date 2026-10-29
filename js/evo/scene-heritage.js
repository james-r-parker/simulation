// Rules 2, 7, 8 and 9 (natural-selection.md, Detectors): what a life hands on.
//
// - `eval.skill_heritability`: over split and mate births after burn-in, the Pearson correlation between the parent's
//   deliberate meal share at the birth (the mean of both parents for a mate birth, the one that is still alive here)
//   and the child's at its tenth meal. A child with fewer than ten meals is left out; its `bonus` terms are not read.
//   The meal counters are the sim's `mealsTotal` and `mealsDeliberate`, so it needs `meritEnabled`.
// - `eval.social_return`: the matured grandchildren of agents that earned a social credit (a pack kill, an alarm or a
//   hunt-call credit) minus those of agents that did not, over agents of equal age (buckets of `AGE_BUCKET_TICKS`,
//   weighted by the smaller group of the two), over mature deaths after burn-in. A grandchild is credited to each
//   living grandparent when it matures (`ageTicks` equals `maturityTicks`). A negative value is the cheater signal.
//
// Per-slot arrays and fixed buckets; the pair log grows by doubling.

import { createLog, ensureRoom } from './growable-log.js';
import { none, ok, pearson } from './metrics-stats.js';
import { BURN_IN_TICKS } from './observer-events.js';

/** The child meal at which its deliberate share is read. */
export const TENTH_MEAL = 10;

/** Fewest (parent, child) pairs for the correlation. */
export const MIN_HERITABILITY_PAIRS = 10;

/** Width of an age bucket for the social comparison, in ticks. */
export const AGE_BUCKET_TICKS = 1000;

const BUCKETS = 32;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene
 */
export function createHeritageScene(config) {
    const n = config.maxAgents;
    return {
        parentShare: new Float64Array(n),
        pending: new Uint8Array(n),
        pairs: createLog(['parent', 'child']),
        pairCount: 0,
        grand: new Uint32Array(n),
        credited: new Float64Array(BUCKETS),
        creditedAgents: new Float64Array(BUCKETS),
        plain: new Float64Array(BUCKETS),
        plainAgents: new Float64Array(BUCKETS),
    };
}

/**
 * @param {Record<string, any>} scene the heritage scene
 * @param {number} slot the slot of a born or dead agent
 * @returns {void}
 */
export function resetHeritageSlot(scene, slot) {
    scene.pending[slot] = 0;
    scene.grand[slot] = 0;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {number} its deliberate meals over its meals, 0 with none
 */
function shareOf(world, slot) {
    const total = world.mealsTotal[slot];
    return total === 0 ? 0 : world.mealsDeliberate[slot] / total;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a parent slot from `parentSlotA` or `parentSlotB`, -1 for none
 * @param {number} genomeId the parent's genome id
 * @returns {boolean} whether the slot still holds that parent alive
 */
function liveParent(world, slot, genomeId) {
    return slot >= 0 && world.alive[slot] === 1 && world.genomeId[slot] === genomeId;
}

/**
 * Notes a split or mate birth after burn-in: opens a pair with the parents' deliberate share now. Needs `meritEnabled`.
 * @param {Record<string, any>} scene the heritage scene
 * @param {Record<string, any>} world the world
 * @param {number} child the newborn's slot
 * @returns {void}
 */
export function noteHeritageBirth(scene, world, child) {
    if (!world.config.meritEnabled || world.tick < BURN_IN_TICKS) {
        return;
    }
    const a = world.parentSlotA[child];
    const b = world.parentSlotB[child];
    const both = a !== b && liveParent(world, a, world.parentA[child]) && liveParent(world, b, world.parentB[child]);
    const only = liveParent(world, a, world.parentA[child]) ? a : b;
    if (both) {
        scene.parentShare[child] = (shareOf(world, a) + shareOf(world, b)) / 2;
    } else if (liveParent(world, only, only === a ? world.parentA[child] : world.parentB[child])) {
        scene.parentShare[child] = shareOf(world, only);
    } else {
        return;
    }
    scene.pending[child] = 1;
}

/**
 * Closes the pair of a child that has reached its tenth meal.
 * @param {Record<string, any>} scene the heritage scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
export function trackHeritage(scene, world, slot) {
    if (scene.pending[slot] === 1 && world.mealsTotal[slot] >= TENTH_MEAL) {
        const row = scene.pairCount++;
        ensureRoom(scene.pairs, row);
        scene.pairs.parent[row] = scene.parentShare[slot];
        scene.pairs.child[row] = shareOf(world, slot);
        scene.pending[slot] = 0;
    }
}

const seen = new Int32Array(4);

/**
 * @param {Record<string, any>} tree the family tree
 * @param {number} node a child's node
 * @param {number} i 0 to 3: the child's first parent's two parents, then the second parent's two
 * @returns {number} that grandparent's node, or -1
 */
function grandNode(tree, node, i) {
    const parent = i < 2 ? tree.parentA[node] : tree.parentB[node];
    if (parent < 0) {
        return -1;
    }
    return i % 2 === 0 ? tree.parentA[parent] : tree.parentB[parent];
}

/**
 * @param {number} slot a slot
 * @param {number} count how many entries of `seen` are filled
 * @returns {boolean} whether the slot is among them
 */
function isSeen(slot, count) {
    for (let k = 0; k < count; k++) {
        if (seen[k] === slot) {
            return true;
        }
    }
    return false;
}

/**
 * Credits the living grandparents of a child that has just matured, each once.
 * @param {Record<string, any>} scene the heritage scene
 * @param {Record<string, any>} observer the observer, with its family tree
 * @param {number} child the matured child's slot
 * @returns {void}
 */
export function creditGrandparents(scene, observer, child) {
    const tree = observer.family;
    const node = tree.nodeOf.get(observer.genomeId[child]);
    if (node === undefined) {
        return;
    }
    let credited = 0;
    for (let i = 0; i < 4; i++) {
        const grand = grandNode(tree, node, i);
        const slot = grand < 0 ? undefined : observer.slotOf.get(tree.genome[grand]);
        if (slot !== undefined && !isSeen(slot, credited)) {
            scene.grand[slot] += 1;
            seen[credited++] = slot;
        }
    }
}

/**
 * Adds a mature death after burn-in to its age bucket as a credited or plain agent.
 * @param {Record<string, any>} scene the heritage scene
 * @param {Record<string, any>} observer the observer
 * @param {{slot: number, age: number}} death the dying agent's slot and age
 * @returns {void}
 */
export function noteHeritageDeath(scene, observer, { slot, age }) {
    const bucket = Math.min(BUCKETS - 1, Math.floor(age / AGE_BUCKET_TICKS));
    const social =
        observer.packKills[slot] > 0 || observer.intent.alarmCredits[slot] > 0 || observer.intent.huntCredits[slot] > 0;
    const sums = social ? scene.credited : scene.plain;
    const agents = social ? scene.creditedAgents : scene.plainAgents;
    sums[bucket] += scene.grand[slot];
    agents[bucket] += 1;
}

/**
 * @param {Record<string, any>} scene the heritage scene
 * @returns {import('./metrics-stats.js').MetricResult} the correlation of parent and child deliberate share
 */
function heritability(scene) {
    if (scene.pairCount < MIN_HERITABILITY_PAIRS) {
        return none(`fewer than ${MIN_HERITABILITY_PAIRS} children with ten meals after burn-in (needs meritEnabled)`);
    }
    const r = pearson(scene.pairs.parent.subarray(0, scene.pairCount), scene.pairs.child.subarray(0, scene.pairCount));
    return Number.isNaN(r) ? none('parent or child share is constant') : ok(r);
}

/**
 * @param {Record<string, any>} scene the heritage scene
 * @returns {import('./metrics-stats.js').MetricResult} the weighted age-matched grandchild difference
 */
function socialReturn(scene) {
    let weight = 0;
    let total = 0;
    for (let b = 0; b < BUCKETS; b++) {
        const w = Math.min(scene.creditedAgents[b], scene.plainAgents[b]);
        if (w > 0) {
            total += w * (scene.credited[b] / scene.creditedAgents[b] - scene.plain[b] / scene.plainAgents[b]);
            weight += w;
        }
    }
    return weight > 0 ? ok(total / weight) : none('no age with both a credited and an uncredited mature death');
}

/**
 * @param {Record<string, any>} scene the heritage scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two metrics
 */
export function heritageMetrics(scene) {
    return { 'eval.skill_heritability': heritability(scene), 'eval.social_return': socialReturn(scene) };
}
