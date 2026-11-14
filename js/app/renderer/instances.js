// Instanced unit quads for the model materials: one `InstancedBufferGeometry` holding a [-1, 1] square and named
// vec4 instance attributes over preallocated arrays. `uploadInstances` marks only the rows written this frame and sets
// the instance count (0 skips the draw). Nothing allocates after `createInstances`.

import {
    BufferAttribute,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
} from 'three/webgpu';

/** Floats per instance attribute. */
export const VEC4 = 4;
const CORNERS = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const INDEX = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * @typedef {object} Instances
 * @property {any} geometry the geometry
 * @property {Record<string, Float32Array>} arrays each attribute's array, `capacity x 4`
 * @property {Record<string, any>} attributes each `InstancedBufferAttribute`
 * @property {number} capacity the most instances
 * @property {any[]} list the attributes in a fixed array, for the per-frame upload
 */

/**
 * @param {number} capacity the most instances
 * @param {readonly string[]} names the vec4 attributes
 * @param {Record<string, Float32Array>} [shared] arrays to use instead of fresh ones (a packer's own buckets)
 * @returns {Instances} the geometry and its arrays
 */
export function createInstances(capacity, names, shared = {}) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(CORNERS, 3));
    geometry.setIndex(new BufferAttribute(INDEX, 1));
    /** @type {Record<string, Float32Array>} */
    const arrays = {};
    /** @type {Record<string, any>} */
    const attributes = {};
    for (const name of names) {
        const array = shared[name] ?? new Float32Array(capacity * VEC4);
        if (array.length < capacity * VEC4) {
            throw new Error(`createInstances: ${name} holds ${array.length} floats, under ${capacity} x 4`);
        }
        const attribute = new InstancedBufferAttribute(array, VEC4);
        attribute.setUsage(DynamicDrawUsage);
        geometry.setAttribute(name, attribute);
        arrays[name] = array;
        attributes[name] = attribute;
    }
    geometry.instanceCount = 0;
    return { geometry, arrays, attributes, capacity, list: Object.values(attributes) };
}

/**
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
    for (const attribute of instances.list) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, n * VEC4);
        attribute.needsUpdate = true;
    }
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
