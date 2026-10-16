// The observer's per-tick counters for every alive agent: age and energy copies, distance, turns towards food,
// visited cells and the 100-tick motion samples; and collisions, counted right after the physics phase.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { LOSS_CAUSE } from '../sim/energy.js';
import { markCell } from './cell-grid.js';

/** Grid cell edge, in world px, for `cellsVisited`. */
export const CELL_SIZE = 200;

/** `cellsVisited` is sampled when `world.tick` divides by this. */
export const CELL_SAMPLE_TICKS = 10;

/** The motion samples are taken when `world.tick` divides by this. */
export const MOTION_SAMPLE_TICKS = 100;

/** A turn counts only above this fraction of `maxTurn`. */
export const TURN_THRESHOLD = 0.1;

const FOOD_CHANNEL = 1;

/**
 * Index of the ray with the nearest hit whose class flag is in `first..last` (channels within a ray); the first of
 * equal distances.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {number} first first class channel
 * @param {number} last last class channel
 * @returns {number} the ray index, or -1 when no ray hits such a thing
 */
export function nearestClassRay(world, slot, first, last) {
    const stride = world.layout.inputCount;
    let best = -1;
    let bestProximity = -1;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = slot * stride + k * RAY_CHANNELS;
        for (let c = first; c <= last && world.inputs[base] > bestProximity; c++) {
            if (world.inputs[base + c] === 1) {
                bestProximity = world.inputs[base];
                best = k;
            }
        }
    }
    return best;
}

/**
 * Index of the ray with the nearest food hit among the rays that hit food; the first of equal distances.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {number} the ray index, or -1 when no ray sees food
 */
export function nearestFoodRay(world, slot) {
    return nearestClassRay(world, slot, FOOD_CHANNEL, FOOD_CHANNEL);
}

/**
 * Whether the agent turns towards the nearest food hit. Ray `k` points `2 pi k / rayCount` from the heading, rotated
 * in the same sense as a positive `turnRate`, so rays `0 < k < rayCount / 2` lie on the positive side and
 * `rayCount / 2 < k < rayCount` on the negative side. The ray dead ahead (`k = 0`) and the one dead behind
 * (`k = rayCount / 2`) lie on neither side, so they never count.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean}
 */
export function turnsTowardsFood(world, slot) {
    const turn = world.turnRate[slot];
    if (Math.abs(turn) <= TURN_THRESHOLD * world.config.maxTurn) {
        return false;
    }
    const k = nearestFoodRay(world, slot);
    const doubled = 2 * k;
    const { rayCount } = world.config;
    if (k <= 0 || doubled === rayCount) {
        return false;
    }
    return doubled < rayCount ? turn > 0 : turn < 0;
}

/**
 * Marks the agent's current 200 px cell and counts it when new.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {void}
 */
function visitCell(observer, world, slot) {
    if (markCell(observer, slot, world.x[slot], world.y[slot])) {
        observer.cellsVisited[slot] += 1;
    }
}

/**
 * Adds one motion sample: `min(1, speed / maxVelocity)` and `|turnRate| / maxTurn`.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {number} speed the agent's speed this tick
 * @returns {void}
 */
function sampleMotion(observer, world, slot, speed) {
    const { maxVelocity, maxTurn } = world.config;
    observer.speedSum[slot] += Math.min(1, speed / maxVelocity);
    observer.turnSum[slot] += Math.abs(world.turnRate[slot]) / maxTurn;
    observer.samples[slot] += 1;
}

/**
 * Updates the per-slot counters of every alive agent from the world after a step.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function countTick(observer, world) {
    const { alive } = world;
    const cellTick = world.tick % CELL_SAMPLE_TICKS === 0;
    const motionTick = world.tick % MOTION_SAMPLE_TICKS === 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        observer.ageTicks[slot] = world.ageTicks[slot];
        observer.foodEnergy[slot] = world.foodEnergy[slot];
        observer.biteEnergy[slot] = world.biteEnergy[slot];
        const speed = Math.sqrt(world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot]);
        observer.distance[slot] += speed;
        if (turnsTowardsFood(world, slot)) {
            observer.turnsTowardsFood[slot] += 1;
        }
        if (cellTick) {
            visitCell(observer, world, slot);
        }
        if (motionTick) {
            sampleMotion(observer, world, slot, speed);
        }
    }
}

/**
 * Counts a collision for every alive agent whose `lastLoss` is `collision` right after the physics phase. It must
 * run there: `applyCosts` later in the same tick sets `lastLoss` to `cost` whenever it removes energy.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function countCollisions(observer, world) {
    const { alive, lastLoss } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && lastLoss[slot] === LOSS_CAUSE.COLLISION) {
            observer.collisions[slot] += 1;
        }
    }
}
