// The parent diet metrics (fitness-and-selection T48e): at each birth after burn-in, how much of the parent's eating was
// deliberate. A split birth reads its one parent; a mate birth reads the mean of both parents (the mother alone when the
// father is gone). A parent's share is its `mealsDeliberate` over its `mealsTotal` at that moment, 0 with no meals.
// Read-only on the world;

import { none, ok } from './metrics-stats.js';

/** A split parent whose deliberate share is below this is a bumper. */
export const BUMPER_SHARE = 0.1;

/** The direction of each parent-diet metric, as the metrics table names them. */
export const DIET_DIRECTIONS = Object.freeze({
    'eval.split_parent_delib_share': 'watch',
    'eval.mate_parent_delib_share': 'watch',
    'eval.split_bumper_share': 'watch',
});

/**
 * @returns {Record<string, any>} the parent-diet counters
 */
export function createDietPools() {
    return {
        splits: 0,
        splitShareSum: 0,
        splitBumpers: 0,
        mates: 0,
        mateShareSum: 0,
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {number} the slot's deliberate meals over its meals, 0 when it has not eaten
 */
function shareOf(world, slot) {
    const total = world.mealsTotal[slot];
    return total === 0 ? 0 : world.mealsDeliberate[slot] / total;
}

/**
 * Notes one split birth: its parent's deliberate share now.
 * @param {Record<string, any>} pools the diet pools
 * @param {Record<string, any>} world the world
 * @param {number} child the child's slot (`parentSlotA` is the parent)
 * @returns {void}
 */
export function noteSplitBirth(pools, world, child) {
    const share = shareOf(world, world.parentSlotA[child]);
    pools.splits += 1;
    pools.splitShareSum += share;
    pools.splitBumpers += share < BUMPER_SHARE ? 1 : 0;
}

/**
 * Notes one mate birth: the mean deliberate share of the mother and, while he is alive in his slot, the father.
 * @param {Record<string, any>} pools the diet pools
 * @param {Record<string, any>} world the world
 * @param {number} child the child's slot
 * @param {number} fatherId the father's genome id (`parentB` of the child)
 * @returns {void}
 */
export function noteMateParents(pools, world, child, fatherId) {
    const mother = shareOf(world, world.parentSlotA[child]);
    const father = world.parentSlotB[child];
    const fatherHere = father >= 0 && world.alive[father] === 1 && world.genomeId[father] === fatherId;
    pools.mates += 1;
    pools.mateShareSum += fatherHere ? (mother + shareOf(world, father)) / 2 : mother;
}

/**
 * @param {Record<string, any>} pools the diet pools
 * @param {number} count births counted
 * @param {number} sum what to average
 * @param {string} what what was not counted, for the reason
 * @returns {import('./metrics-stats.js').MetricResult} the mean, or `null` with a reason
 */
function mean(pools, count, sum, what) {
    return count === 0 ? none(`no ${what} birth after burn-in`) : ok(sum / count);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three parent-diet metrics
 */
export function dietMetrics(observer) {
    const pools = observer.diet;
    return {
        'eval.split_parent_delib_share': mean(pools, pools.splits, pools.splitShareSum, 'split'),
        'eval.mate_parent_delib_share': mean(pools, pools.mates, pools.mateShareSum, 'mate'),
        'eval.split_bumper_share': mean(pools, pools.splits, pools.splitBumpers, 'split'),
    };
}
