// Helpers for instanced quads: the unit-quad geometry, preallocated vec4 instance attributes, and uploading only the used
// part of each.

import {
    BufferAttribute,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    InstancedMesh,
} from 'three';

/** Floats per vec4 instance attribute. */
export const VEC4 = 4;

/**
 * @param {number} capacity the most instances
 * @param {string[]} names the vec4 instance attribute names
 * @returns {any} an instanced geometry: a unit quad (corners at +-1 in `corner`) and one empty attribute per name
 */
export function createQuadGeometry(capacity, names) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('corner', new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    for (const name of names) {
        const attribute = new InstancedBufferAttribute(new Float32Array(capacity * VEC4), VEC4);
        attribute.setUsage(DynamicDrawUsage);
        geometry.setAttribute(name, attribute);
    }
    return geometry;
}

/**
 * @param {any} geometry from `createQuadGeometry`
 * @param {any} material the material
 * @param {number} capacity the most instances
 * @returns {any} an `InstancedMesh` that draws nothing until `uploadInstances` sets a count, never frustum culled
 */
export function createQuadMesh(geometry, material, capacity) {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    return mesh;
}

/**
 * Copies the first `count` instances of each source array into the mesh's attributes and uploads only that part.
 * @param {any} mesh the instanced mesh
 * @param {Record<string, Float32Array>} sources the packed arrays by attribute name
 * @param {number} count the instances to draw
 * @returns {void}
 */
export function uploadInstances(mesh, sources, count) {
    for (const name of Object.keys(sources)) {
        const attribute = mesh.geometry.getAttribute(name);
        attribute.array.set(sources[name].subarray(0, count * VEC4));
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * VEC4);
        attribute.needsUpdate = true;
    }
    mesh.count = count;
    mesh.visible = count > 0;
}
