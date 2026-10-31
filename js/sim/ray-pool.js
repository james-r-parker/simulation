// Pools raw rays into the brain row: the two strongest hits per channel, two food hues, then the body block.

import {
    EXTRA_INPUTS,
    FOOD_HUE_VALUES,
    HIT_STRIDE,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    POOLED_VALUES,
    RAY_CHANNELS,
} from './brain-layout.js';

/**
 * @param {Float32Array} inputs the raw inputs
 * @param {number} base the index of a ray's proximity
 * @returns {number} the pooled channel the ray hit (0 to 7), or -1 when it hit nothing
 */
function channelOf(inputs, base) {
    if (inputs[base] <= 0) {
        return -1;
    }
    for (let c = 0; c < POOLED_CHANNELS.length; c++) {
        if (inputs[base + 1 + c] > 0) {
            return c;
        }
    }
    return -1;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot agent slot
 * @param {number} ray ray index
 * @param {boolean} first whether this is the new strongest hit
 * @returns {void}
 */
function copyHue(world, slot, ray, first) {
    const start = slot * world.layout.inputCount + POOLED_VALUES - FOOD_HUE_VALUES;
    if (first) {
        world.pooled[start + 1] = world.pooled[start];
    }
    world.pooled[start + (first ? 0 : 1)] = world.rayHue[slot * world.config.rayCount + ray];
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot agent slot
 * @returns {void}
 */
function copyBody(world, slot) {
    const body = slot * world.layout.rawInputCount + world.config.rayCount * RAY_CHANNELS;
    const out = slot * world.layout.inputCount + POOLED_VALUES;
    for (let i = 0; i < EXTRA_INPUTS; i++) {
        world.pooled[out + i] = world.inputs[body + i];
    }
}

/**
 * Writes the `pooled` row of an alive agent from its `inputs` row. For each of the eight ray channels (food, threat,
 * prey, other, kin, wall, obstacle, smoke) the two strongest hits over the rays give, strongest first, a strength (the
 * ray's proximity) and the cosine and sine of that ray's angle in the agent's own frame. An unused slot is 0 in all
 * three values. The first ray wins a tie. Two food hues follow the ray values, then the unchanged body values. Every value lies in [-1, 1].
 * @param {import('./world.js').World} world the world
 * @param {number} slot the alive agent
 * @returns {void}
 */
export function poolRays(world, slot) {
    const { inputs, pooled, rayCos, raySin } = world;
    const { rayCount } = world.config;
    const rawBase = slot * world.layout.rawInputCount;
    const out = slot * world.layout.inputCount;
    for (let i = 0; i < POOLED_VALUES; i++) {
        pooled[out + i] = 0;
    }
    for (let k = 0; k < rayCount; k++) {
        const base = rawBase + k * RAY_CHANNELS;
        const c = channelOf(inputs, base);
        if (c < 0) {
            continue;
        }
        const first = out + c * POOLED_STRIDE;
        const second = first + HIT_STRIDE;
        const proximity = inputs[base];
        if (proximity > pooled[first]) {
            if (c === 0) {
                copyHue(world, slot, k, true);
            }
            pooled[second] = pooled[first];
            pooled[second + 1] = pooled[first + 1];
            pooled[second + 2] = pooled[first + 2];
            pooled[first] = proximity;
            pooled[first + 1] = rayCos[k];
            pooled[first + 2] = raySin[k];
        } else if (proximity > pooled[second]) {
            if (c === 0) {
                copyHue(world, slot, k, false);
            }
            pooled[second] = proximity;
            pooled[second + 1] = rayCos[k];
            pooled[second + 2] = raySin[k];
        }
    }
    copyBody(world, slot);
}
