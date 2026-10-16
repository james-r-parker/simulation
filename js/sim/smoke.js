// The smoke cloud pool: releasing a cloud behind an agent and ageing the live clouds.

import { detCos, detSin } from './det-math.js';

/** @typedef {import('./world.js').World} World */

/**
 * Appends a cloud of radius `smokeRadius` and life `smokeTicks`, centred `size + smokeRadius` behind the agent along
 * its heading and clamped to the world, so the agent stands just outside it.
 * @param {World} world the world
 * @param {number} slot the releasing agent
 * @returns {number} the index of the new cloud
 * @throws {Error} when the pool already holds `maxClouds` clouds
 */
export function releaseSmoke(world, slot) {
    const { maxClouds, smokeRadius, smokeTicks, worldWidth, worldHeight } = world.config;
    const index = world.cloudCount;
    if (index >= maxClouds) {
        throw new Error(`releaseSmoke: the cloud pool is full (maxClouds ${maxClouds}) at tick ${world.tick}`);
    }
    const back = world.size[slot] + smokeRadius;
    const x = world.x[slot] - back * detCos(world.angle[slot]);
    const y = world.y[slot] - back * detSin(world.angle[slot]);
    world.cloudX[index] = Math.min(worldWidth, Math.max(0, x));
    world.cloudY[index] = Math.min(worldHeight, Math.max(0, y));
    world.cloudTtl[index] = smokeTicks;
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
