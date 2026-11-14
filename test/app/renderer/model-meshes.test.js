import { describe, expect, it } from 'vitest';
import { float } from 'three/tsl';
import { createModelMeshes } from '../../../js/app/renderer/model-meshes.js';
import { MODELS } from '../../../js/app/renderer/models.js';

/** @returns {any} a bucket of capacity 4 */
const bucket = (/** @type {boolean} */ withGate = false) => ({
    pose: new Float32Array(16),
    neon: new Float32Array(16),
    ...(withGate ? { gate: new Float32Array(16) } : {}),
    count: 0,
});

describe('createModelMeshes', () => {
    it('builds one mesh per model over its bucket and uploads each bucket count', () => {
        const buckets = [bucket(), bucket(true)];
        const meshes = createModelMeshes([MODELS.MOTE, MODELS.patch], {
            capacity: 4,
            buckets,
            more: ({ gate }) => ({ values: { fill: gate.x, ripe: gate.y } }),
        });
        expect(meshes.object.children).toHaveLength(2);
        buckets[1].count = 3;
        meshes.upload();
        expect(meshes.object.children[1].geometry.instanceCount).toBe(3);
        expect(meshes.object.children[1].geometry.attributes.iGate).toBeDefined();
        meshes.clear();
        expect(meshes.object.children[1].geometry.instanceCount).toBe(0);
        meshes.setPalette('high-contrast');
        expect(meshes.rimPx.value).toBe(2.5);
        meshes.setPalette('nope');
        expect(meshes.rimPx.value).toBe(1.5);
        meshes.dispose();
    });

    it('sets the blending when asked', () => {
        const meshes = createModelMeshes([MODELS.MOTE], {
            capacity: 4,
            buckets: [bucket()],
            blending: 2,
            more: () => ({ values: { x: float(0) } }),
        });
        expect(meshes.object.children[0].material.blending).toBe(2);
    });
});
