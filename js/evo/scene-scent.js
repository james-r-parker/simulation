// Scent-trails detectors (scent-trails.md, Phase 1). Observer-only state.

import { BURN_IN_TICKS } from './burn-in.js';
import { CHASE_FLAG, chasesFlagged } from './chase-outcome.js';
import { none, ok } from './metrics-stats.js';
import { visionOf } from '../sim/traits.js';

export const REACQUIRE_WINDOW = 120;
const HISTORY_TICKS = REACQUIRE_WINDOW;
const NO_CHASES = 'no resolved chases after burn-in';
const NO_CARCASS_MEALS = 'no carcass meals after burn-in';

/** @param {Readonly<Record<string, any>>} config @returns {Record<string, any>} an empty scent detector scene */
export function createScentScene(config) {
    const slots = config.maxAgents;
    return {
        lastSight: new Float64Array(slots).fill(-1),
        reacquired: new Uint8Array(slots),
        historyHead: new Uint16Array(slots),
        historyX: new Float32Array(slots * HISTORY_TICKS),
        historyY: new Float32Array(slots * HISTORY_TICKS),
        historyTick: new Float64Array(slots * HISTORY_TICKS).fill(-1),
        carcassMeals: 0,
        approachedMeals: 0,
        mealX: 0,
        mealY: 0,
        mealSince: 0,
    };
}

/** @param {Record<string, any>} scene @param {number} slot */
export function resetScentSlot(scene, slot) {
    scene.lastSight[slot] = -1;
    scene.reacquired[slot] = 0;
    scene.historyHead[slot] = 0;
    const base = slot * HISTORY_TICKS;
    for (let age = 0; age < HISTORY_TICKS; age++) {
        scene.historyTick[base + age] = -1;
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world */
export function tickScent(scene, world) {
    const { alive, x, y, tick } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        const head = scene.historyHead[slot];
        const index = slot * HISTORY_TICKS + head;
        scene.historyX[index] = x[slot];
        scene.historyY[index] = y[slot];
        scene.historyTick[index] = tick;
        scene.historyHead[slot] = (head + 1) % HISTORY_TICKS;
    }
}

/**
 * Notes the current prey sighting for a hunter's open chase.
 * @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot
 */
export function notePreySight(scene, world, slot) {
    const { tick } = world;
    const previous = scene.lastSight[slot];
    if (previous >= 0 && tick - previous > 1 && tick - previous <= REACQUIRE_WINDOW) {
        scene.reacquired[slot] = 1;
    }
    scene.lastSight[slot] = tick;
}

/** @param {Record<string, any> | undefined} scene @param {number} slot @returns {number} chase flag bits */
export function scentChaseFlags(scene, slot) {
    return scene?.reacquired[slot] === 1 ? CHASE_FLAG.REACQUIRED : 0;
}

/**
 * Whether recent movement into a carcass meal came from beyond sight and closed for three sampled ticks.
 * @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot
 * @returns {boolean}
 */
function closedFromBeyondSight(scene, world, slot) {
    const base = slot * HISTORY_TICKS;
    const head = scene.historyHead[slot];
    let previousDistance = Infinity;
    let closingTicks = 0;
    let startedBeyondSight = false;
    for (let age = 1; age < HISTORY_TICKS; age++) {
        const index = base + ((head - age + HISTORY_TICKS) % HISTORY_TICKS);
        if (scene.historyTick[index] < Math.max(BURN_IN_TICKS, scene.mealSince)) {
            break;
        }
        const dx = scene.historyX[index] - scene.mealX;
        const dy = scene.historyY[index] - scene.mealY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (age === 1) {
            previousDistance = distance;
            continue;
        }
        if (distance <= previousDistance) {
            break;
        }
        closingTicks += 1;
        startedBeyondSight ||= distance > visionOf(world, slot);
        previousDistance = distance;
        if (closingTicks >= 3 && startedBeyondSight) {
            return true;
        }
    }
    return false;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot */
export function noteScavengeMeal(scene, world, slot) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    scene.carcassMeals += 1;
    scene.approachedMeals += closedFromBeyondSight(scene, world, slot) ? 1 : 0;
}

/** @param {Record<string, any>} scene @param {{total: number, byClass: Float64Array, flagged: Float64Array}} tally @returns {import('./metrics-stats.js').MetricRecord} */
export function scentMetrics(scene, tally) {
    const chases = tally.total;
    return {
        'eval.chase_reacquire_share':
            chases === 0 ? none(NO_CHASES) : ok(chasesFlagged(tally, CHASE_FLAG.REACQUIRED) / chases),
        'eval.scavenge_approach_share':
            scene.carcassMeals === 0 ? none(NO_CARCASS_MEALS) : ok(scene.approachedMeals / scene.carcassMeals),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const scentDetector = {
    name: 'scent',
    modules: ['js/evo/scene-scent.js'],
    create: (config) => createScentScene(config),
    onSlotFree: (scene, slot) => resetScentSlot(scene, slot),
    metrics: (scene, world, observer) => scentMetrics(scene, observer.scenes.approach.tally),
};
