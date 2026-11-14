import { describe, expect, it } from 'vitest';
import { createInstances, instancedMesh, uploadInstances, VEC4 } from '../../../js/app/renderer/instances.js';

describe('createInstances', () => {
    it('makes a unit quad with one vec4 attribute per name, over shared arrays when given', () => {
        const shared = new Float32Array(8 * VEC4);
        const inst = createInstances(8, ['iPose', 'iColor'], { iPose: shared });
        expect(inst.geometry.attributes.position.count).toBe(4);
        expect(inst.geometry.index.count).toBe(6);
        expect(inst.arrays.iPose).toBe(shared);
        expect(inst.arrays.iColor).toHaveLength(32);
        expect(inst.geometry.instanceCount).toBe(0);
    });

    it('refuses a shared array that is too short', () => {
        expect(() => createInstances(8, ['iPose'], { iPose: new Float32Array(4) })).toThrow(/under 8/);
    });
});

describe('uploadInstances', () => {
    it('marks only the written rows, caps at capacity and skips the draw at zero', () => {
        const inst = createInstances(4, ['iPose']);
        uploadInstances(inst, 2);
        const attr = inst.attributes.iPose;
        expect(inst.geometry.instanceCount).toBe(2);
        expect(attr.updateRanges).toEqual([{ start: 0, count: 8 }]);
        expect(attr.version).toBeGreaterThan(0);
        uploadInstances(inst, 9);
        expect(inst.geometry.instanceCount).toBe(4);
        uploadInstances(inst, 0);
        expect(inst.geometry.instanceCount).toBe(0);
    });

    it('builds a mesh that is never culled', () => {
        const inst = createInstances(1, ['iPose']);
        expect(instancedMesh(inst, null).frustumCulled).toBe(false);
    });
});
