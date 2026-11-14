// Instanced unit quads for the model materials: one `InstancedBufferGeometry` holding a [-1, 1] square and named vec4
// instance attributes. The packers write each attribute into its own preallocated lane; `uploadInstances` copies the
// rows written this frame into one interleaved buffer, so every mesh binds two vertex buffers (the quad and the
// instances) whatever its attribute count. WebGPU allows only 8 vertex buffers per pipeline by default, and the agents
// read 9 attributes. Nothing allocates after `createInstances`.

import {
    BufferAttribute,
    DynamicDrawUsage,
    InstancedBufferGeometry,
    InstancedInterleavedBuffer,
    InterleavedBufferAttribute,
    Mesh,
} from 'three/webgpu';

/** Floats per instance attribute. */
export const VEC4 = 4;
const CORNERS = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const INDEX = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * @typedef {object} Instances
 * @property {any} geometry the geometry
 * @property {Record<string, Float32Array>} arrays each attribute's lane, `capacity x 4`, written by the packers
 * @property {Float32Array[]} lanes the same lanes in attribute order, for the per-frame copy
 * @property {Float32Array} data the interleaved instance rows the GPU reads, `capacity x stride`
 * @property {any} buffer the `InstancedInterleavedBuffer` over `data`
 * @property {number} stride floats per interleaved row
 * @property {number} capacity the most instances
 */

/**
 * @param {number} capacity the most instances
 * @param {readonly string[]} names the vec4 attributes
 * @param {Record<string, Float32Array>} [shared] lanes to use instead of fresh ones (a packer's own buckets)
 * @returns {Instances} the geometry and its lanes
 */
export function createInstances(capacity, names, shared = {}) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(CORNERS, 3));
    geometry.setIndex(new BufferAttribute(INDEX, 1));
    const stride = names.length * VEC4;
    const data = new Float32Array(Math.max(capacity, 1) * stride);
    const buffer = new InstancedInterleavedBuffer(data, stride, 1);
    buffer.setUsage(DynamicDrawUsage);
    /** @type {Record<string, Float32Array>} */
    const arrays = {};
    names.forEach((name, k) => {
        const lane = shared[name] ?? new Float32Array(capacity * VEC4);
        if (lane.length < capacity * VEC4) {
            throw new Error(`createInstances: ${name} holds ${lane.length} floats, under ${capacity} x 4`);
        }
        arrays[name] = lane;
        geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, VEC4, k * VEC4));
    });
    geometry.instanceCount = 0;
    return { geometry, arrays, lanes: names.map((n) => arrays[n]), data, buffer, stride, capacity };
}

/**
 * Copies the first `count` rows of every lane into the interleaved buffer and marks only those rows for upload.
 * @param {Instances} instances the instances
 * @param {number} count the rows written this frame
 * @returns {void}
 */
export function uploadInstances(instances, count) {
    const n = Math.min(count, instances.capacity);
    instances.geometry.instanceCount = n;
    if (n === 0) {
        return;
    }
    const { lanes, data, stride } = instances;
    for (let k = 0; k < lanes.length; k++) {
        const lane = lanes[k];
        const at = k * VEC4;
        for (let row = 0; row < n; row++) {
            const o = row * stride + at;
            const i = row * VEC4;
            data[o] = lane[i];
            data[o + 1] = lane[i + 1];
            data[o + 2] = lane[i + 2];
            data[o + 3] = lane[i + 3];
        }
    }
    instances.buffer.clearUpdateRanges();
    instances.buffer.addUpdateRange(0, n * stride);
    instances.buffer.needsUpdate = true;
}

/**
 * @param {Instances} instances the instances
 * @param {any} material the material
 * @returns {any} a mesh that is never culled
 */
export function instancedMesh(instances, material) {
    const mesh = new Mesh(instances.geometry, material);
    mesh.frustumCulled = false;
    return mesh;
}

/**
 * @param {any} geometry a geometry
 * @returns {number} the GPU vertex buffers it binds: one per plain attribute, one per interleaved buffer
 */
export function vertexBufferCount(geometry) {
    const buffers = new Set();
    for (const attribute of Object.values(geometry.attributes)) {
        buffers.add(
            /** @type {any} */ (attribute).isInterleavedBufferAttribute
                ? /** @type {any} */ (attribute).data
                : attribute,
        );
    }
    return buffers.size;
}
