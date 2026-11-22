// The smoke cloud pool: releasing a cloud behind an agent and ageing the live clouds.

import { detCos, detSin } from './det-math.js';
import { specParams } from './spec-params.js';

/** @typedef {import('./world.js').World} World */

/**
 * Finds the nearest alive hunter (a `canHunt` body other than the releaser) that is within the releaser's `visionRange`
 * and within `smokeAimArc` radians of its heading; allocates nothing.
 * @param {World} world the world
 * @param {number} slot the releasing agent
 * @returns {number} its slot, -1 when none is in front
 */
function hunterInFront(world, slot) {
    const range = world.lanes.visionRange[slot];
    const cosArc = detCos(world.config.smokeAimArc);
    const hx = detCos(world.angle[slot]);
    const hy = detSin(world.angle[slot]);
    let nearest = -1;
    let nearestSq = range * range;
    for (let other = 0; other < world.alive.length; other++) {
        if (other === slot || world.alive[other] !== 1) {
            continue;
        }
        const dx = world.x[other] - world.x[slot];
        const dy = world.y[other] - world.y[slot];
        const distSq = dx * dx + dy * dy;
        if (distSq > nearestSq || distSq === 0 || !specParams(world.config, world.spec[other]).canHunt) {
            continue;
        }
        if ((dx * hx + dy * hy) * (dx * hx + dy * hy) >= cosArc * cosArc * distSq && dx * hx + dy * hy > 0) {
            nearest = other;
            nearestSq = distSq;
        }
    }
    return nearest;
}

/**
 * Appends a cloud of radius `smokeRadius` and life `smokeTicks`, centred `size + smokeRadius` from the agent and clamped
 * to the world, so the agent stands just outside it. The cloud lies toward the nearest hunter in front of the agent
 * (`hunterInFront`), else behind it along its heading, the flee drop.
 * @param {World} world the world
 * @param {number} slot the releasing agent
 * @returns {number} the index of the new cloud
 * @throws {Error} when the pool already holds `maxClouds` clouds
 */
export function releaseSmoke(world, slot) {
    const { maxClouds, worldWidth, worldHeight } = world.config;
    const index = world.cloudCount;
    if (index >= maxClouds) {
        throw new Error(`releaseSmoke: the cloud pool is full (maxClouds ${maxClouds}) at tick ${world.tick}`);
    }
    const back = world.size[slot] + world.lanes.smokeRadius[slot];
    const target = hunterInFront(world, slot);
    let x = world.x[slot] - back * detCos(world.angle[slot]);
    let y = world.y[slot] - back * detSin(world.angle[slot]);
    if (target >= 0) {
        const dx = world.x[target] - world.x[slot];
        const dy = world.y[target] - world.y[slot];
        const scale = back / Math.sqrt(dx * dx + dy * dy);
        x = world.x[slot] + dx * scale;
        y = world.y[slot] + dy * scale;
    }
    world.cloudX[index] = Math.min(worldWidth, Math.max(0, x));
    world.cloudY[index] = Math.min(worldHeight, Math.max(0, y));
    world.cloudTtl[index] = world.lanes.smokeTicks[slot];
    world.cloudCount = index + 1;
    return index;
}

/**
 * Moves the last live cloud into `index` and frees the last entry.
 * @param {World} world the world
 * @param {number} index the cloud to remove
 * @returns {void}
 */
function removeCloud(world, index) {
    const last = world.cloudCount - 1;
    world.cloudX[index] = world.cloudX[last];
    world.cloudY[index] = world.cloudY[last];
    world.cloudTtl[index] = world.cloudTtl[last];
    world.cloudTtl[last] = 0;
    world.cloudCount = last;
}

/**
 * Takes 1 from every live cloud's `cloudTtl`; a cloud reaching 0 is replaced by the last live cloud, and the scan
 * stays on that index so the moved cloud is aged once too.
 * @param {World} world the world
 * @returns {void}
 */
export function ageSmoke(world) {
    const { cloudTtl } = world;
    let i = 0;
    while (i < world.cloudCount) {
        cloudTtl[i] -= 1;
        if (cloudTtl[i] === 0) {
            removeCloud(world, i);
        } else {
            i += 1;
        }
    }
}
