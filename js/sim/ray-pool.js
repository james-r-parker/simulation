// Pools raw rays into the brain row: the two strongest hits per channel, two food hues, then the body block. The
// pooling runs in the brain kernel (`pool` in wasm/src/brain.rs, docs/designs/wasm-kernels.md); this entry pools one
// slot for the tools that read the pooled row without running the brain, and builds the ray angle tables pooling and
// the ray march read.

import { detCos, detSin } from './det-math.js';

const PI = 3.141592653589793;

/**
 * Writes the `pooled` row of an agent from its `inputs` row. For each of the nine ray channels (food, threat, prey,
 * other, kin, wall, obstacle, smoke, megafauna) the two strongest hits over the rays give, strongest first, a strength
 * (the ray's proximity) and the cosine and sine of that ray's angle in the agent's own frame. An unused slot is 0 in
 * all three values. The first ray wins a tie. Two food hues follow the ray values, then the unchanged body values.
 * Every value lies in [-1, 1].
 * @param {Record<string, any>} world a world on the WASM kernels
 * @param {number} slot the agent
 * @returns {void}
 */
export function poolRays(world, slot) {
    const arena = world.wasm;
    arena.exports.pool_slot(arena.offsets.params, slot);
}

/**
 * @param {number} rayCount number of rays
 * @returns {{rayCos: Float64Array, raySin: Float64Array}} unit direction of each ray relative to the heading
 */
export function rayTables(rayCount) {
    const rayCos = new Float64Array(rayCount);
    const raySin = new Float64Array(rayCount);
    for (let k = 0; k < rayCount; k++) {
        const theta = (2 * PI * k) / rayCount;
        rayCos[k] = detCos(theta);
        raySin[k] = detSin(theta);
    }
    return { rayCos, raySin };
}
