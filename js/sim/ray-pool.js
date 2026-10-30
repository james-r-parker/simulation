// Pools an agent's raw rays into the brain's input row: the two strongest hits per channel, then the body block.

import {
    EXTRA_INPUTS,
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
 * Writes the `pooled` row of an alive agent from its `inputs` row. For each of the eight ray channels (food, threat,
 * prey, other, kin, wall, obstacle, smoke) the two strongest hits over the rays give, strongest first, a strength (the
 * ray's proximity) and the cosine and sine of that ray's angle in the agent's own frame. An unused slot is 0 in all
 * three values. The first ray wins a tie. The body block follows unchanged. Every value lies in [-1, 1].
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
            pooled[second] = pooled[first];
            pooled[second + 1] = pooled[first + 1];
            pooled[second + 2] = pooled[first + 2];
            pooled[first] = proximity;
            pooled[first + 1] = rayCos[k];
            pooled[first + 2] = raySin[k];
        } else if (proximity > pooled[second]) {
            pooled[second] = proximity;
            pooled[second + 1] = rayCos[k];
            pooled[second + 2] = raySin[k];
        }
    }
    const body = rawBase + rayCount * RAY_CHANNELS;
    for (let i = 0; i < EXTRA_INPUTS; i++) {
        pooled[out + POOLED_VALUES + i] = inputs[body + i];
    }
}
