// Pools an agent's raw rays into the brain's input row: the strongest hit per channel, then the body block.

import { EXTRA_INPUTS, POOLED_CHANNELS, POOLED_STRIDE, POOLED_VALUES, RAY_CHANNELS } from './brain-layout.js';

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
 * prey, other, kin, wall, obstacle, smoke) the strongest hit over the rays gives a strength (the ray's proximity, 0
 * when no ray hits the channel) and the cosine and sine of that ray's angle in the agent's own frame (both 0 when the
 * strength is 0). The first ray wins a tie. The body block follows unchanged. Every value lies in [-1, 1].
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
        const at = out + c * POOLED_STRIDE;
        if (c >= 0 && inputs[base] > pooled[at]) {
            pooled[at] = inputs[base];
            pooled[at + 1] = rayCos[k];
            pooled[at + 2] = raySin[k];
        }
    }
    const body = rawBase + rayCount * RAY_CHANNELS;
    for (let i = 0; i < EXTRA_INPUTS; i++) {
        pooled[out + POOLED_VALUES + i] = inputs[body + i];
    }
}
