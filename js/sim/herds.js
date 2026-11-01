// Places the seeded scripted herds into the world.

import { detCos, detSin } from './det-math.js';
import { nextFloat, nextInt } from './rng.js';

const TWO_PI = 6.283185307179586;
const LIFE_SPREAD = 0.25;

/** @typedef {import('./world.js').World} World */

/**
 * Finds a herd centre in its assigned basin, leaving the whole ring clear of rocks and the world edge.
 * @param {World} world the world
 * @param {number} group the group index
 * @param {number} clearRadius the centre's clearance from rocks
 * @returns {void}
 */
function placeHerdCentre(world, group, clearRadius) {
    const { worldWidth, worldHeight, placementTries } = world.config;
    const wallEdge = world.obsRadius[0];
    const left = group % 2 === 0;
    const minX = left ? clearRadius : worldWidth / 2 + wallEdge + clearRadius;
    const maxX = left ? worldWidth / 2 - wallEdge - clearRadius : worldWidth - clearRadius;
    const rng = world.rng.herds;
    for (let attempt = 0; attempt < placementTries; attempt++) {
        const x = minX + nextFloat(rng) * (maxX - minX);
        const y = clearRadius + nextFloat(rng) * (worldHeight - 2 * clearRadius);
        if (clearOfRocks(world, x, y, clearRadius)) {
            world.point[0] = x;
            world.point[1] = y;
            return;
        }
    }
    throw new Error(
        `herd placement failed at tick ${world.tick}: no clear centre in basin ${group % 2} after ${placementTries} tries`,
    );
}

/**
 * @param {World} world the world
 * @param {number} x candidate centre x
 * @param {number} y candidate centre y
 * @param {number} radius required rock clearance
 * @returns {boolean} whether the candidate misses every rock
 */
function clearOfRocks(world, x, y, radius) {
    for (let rock = 0; rock < world.obsRadius.length; rock++) {
        const reach = world.obsRadius[rock] + radius;
        const dx = x - world.obsX[rock];
        const dy = y - world.obsY[rock];
        if (Math.sqrt(dx * dx + dy * dy) < reach) {
            return false;
        }
    }
    return true;
}

/**
 * Places the initial herd animals on deterministic rings and assigns their stable IDs.
 * @param {World} world the world
 * @returns {void}
 */
export function createHerds(world) {
    const { herdCount, herdSize, herdRadius, herdLifeTicks, herdStoreMax } = world.config;
    if (herdCount === 0) {
        return;
    }
    const rng = world.rng.herds;
    const ring = (herdSize * 2.2 * herdRadius) / TWO_PI;
    const clearRadius = ring + herdRadius + 60;
    for (let group = 0; group < herdCount; group++) {
        placeHerdCentre(world, group, clearRadius);
        const cx = world.point[0];
        const cy = world.point[1];
        const phase = nextFloat(rng) * TWO_PI;
        for (let animal = 0; animal < herdSize; animal++) {
            const slot = group * herdSize + animal;
            const angle = phase + (animal / herdSize) * TWO_PI;
            world.herdAlive[slot] = 1;
            world.herdGroup[slot] = group;
            world.herdX[slot] = cx + ring * detCos(angle);
            world.herdY[slot] = cy + ring * detSin(angle);
            world.herdAge[slot] = nextInt(rng, herdLifeTicks);
            world.herdLife[slot] = Math.floor(herdLifeTicks * (1 - LIFE_SPREAD + 2 * LIFE_SPREAD * nextFloat(rng)));
            world.herdStore[slot] = herdStoreMax / 2;
            world.herdId[slot] = world.herdNextId;
            world.herdNextId += 1;
        }
        world.groupAnimalCount[group] = herdSize;
    }
}
