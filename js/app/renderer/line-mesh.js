// The GPU side of a line buffer: one additive `LineSegments` that draws the first `vertices` of a `LineBuffer`, with the
// buffer's own arrays as its attributes so nothing is copied.

import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    DynamicDrawUsage,
    LineBasicMaterial,
    LineSegments,
} from 'three';

/**
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer to draw
 * @returns {{object: any, upload: () => void, dispose: () => void}} the mesh; `upload` tells the GPU the buffer changed
 *   and sets how much of it to draw; `dispose` frees the geometry and the material
 */
export function createLineMesh(lines) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(lines.position, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('color', new BufferAttribute(lines.color, 4).setUsage(DynamicDrawUsage));
    const material = new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
    });
    const object = new LineSegments(geometry, material);
    object.frustumCulled = false;
    return {
        object,
        upload() {
            geometry.getAttribute('position').needsUpdate = true;
            geometry.getAttribute('color').needsUpdate = true;
            geometry.setDrawRange(0, lines.vertices);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
