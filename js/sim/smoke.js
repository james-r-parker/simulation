// The smoke cloud pool: releasing a cloud behind an agent and ageing the live clouds.

import { detCos, detSin } from './det-math.js';
import { CH_THREAT, RAY_CHANNELS } from './brain-layout.js';

/** @typedef {import('./world.js').World} World */

/**
 * Finds the ray, within `smokeAimArc` radians of the releaser's heading, that holds the nearest threat (the sense step's
 * own `CH_THREAT` channel: a body that could bite the releaser, seen through its vision range and blocked by walls and
 * obstacles). Reads the ray row already computed this tick; allocates nothing.
 * @param {World} world the world
 * @param {number} slot the releasing agent
 * @returns {number} the ray index, -1 when no threat is seen in front
 */
function threatRayInFront(world, slot) {
    const { inputs, rayCos, config } = world;
    const origin = slot * world.layout.rawInputCount;
    const cosArc = detCos(config.smokeAimArc);
    let best = -1;
    let bestStrength = 0;
    for (let k = 0; k < config.rayCount; k++) {
        const strength = inputs[origin + k * RAY_CHANNELS + CH_THREAT];
        if (strength > bestStrength && rayCos[k] >= cosArc) {
            best = k;
            bestStrength = strength;
        }
    }
    return best;
}

/**
 * Appends a cloud of radius `smokeRadius` and life `smokeTicks`, centred `size + smokeRadius` from the agent and clamped
 * to the world, so the agent stands just outside it. The cloud lies along the ray of the nearest threat it sees in front
 * (`threatRayInFront`), else behind it along its heading, the flee drop.
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
    const ray = threatRayInFront(world, slot);
    const heading = world.angle[slot];
    let x = world.x[slot] - back * detCos(heading);
    let y = world.y[slot] - back * detSin(heading);
    if (ray >= 0) {
        const cosH = detCos(heading);
        const sinH = detSin(heading);
        x = world.x[slot] + back * (cosH * world.rayCos[ray] - sinH * world.raySin[ray]);
        y = world.y[slot] + back * (sinH * world.rayCos[ray] + cosH * world.raySin[ray]);
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
