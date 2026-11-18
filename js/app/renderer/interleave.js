// The interleaving copy of the instanced meshes, in a module of its own: the pack worker runs it into a frame slot and
// must not import three (docs/designs/pack-worker.md). Pure.

/** Floats per instance attribute. */
export const VEC4 = 4;

/**
 * Interleaves the first `count` rows of every lane into `data`: row `r` of lane `k` lands at `r * stride + k * VEC4`.
 * @param {Float32Array[]} lanes the lanes in attribute order, each `count x 4` or more
 * @param {Float32Array} data receives `count x lanes.length x 4` floats
 * @param {number} count the rows to copy
 * @returns {void}
 */
export function interleaveRows(lanes, data, count) {
    const stride = lanes.length * VEC4;
    for (let k = 0; k < lanes.length; k++) {
        const lane = lanes[k];
        const at = k * VEC4;
        for (let row = 0; row < count; row++) {
            const o = row * stride + at;
            const i = row * VEC4;
            data[o] = lane[i];
            data[o + 1] = lane[i + 1];
            data[o + 2] = lane[i + 2];
            data[o + 3] = lane[i + 3];
        }
    }
}
