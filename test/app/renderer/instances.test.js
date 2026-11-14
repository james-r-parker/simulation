import { describe, expect, it } from 'vitest';
import {
    createInstances,
    instancedMesh,
    uploadInstances,
    vertexBufferCount,
    VEC4,
} from '../../../js/app/renderer/instances.js';

describe('createInstances', () => {
    it('makes a unit quad and one vec4 lane per name, over shared lanes when given', () => {
        const shared = new Float32Array(8 * VEC4);
        const inst = createInstances(8, ['iPose', 'iColor'], { iPose: shared });
        expect(inst.geometry.attributes.position.count).toBe(4);
        expect(inst.geometry.index.count).toBe(6);
        expect(inst.arrays.iPose).toBe(shared);
        expect(inst.arrays.iColor).toHaveLength(32);
        expect(inst.geometry.instanceCount).toBe(0);
    });

    it('binds two vertex buffers however many attributes it has (WebGPU allows 8)', () => {
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
        expect(vertexBufferCount(createInstances(4, names).geometry)).toBe(2);
    });

    it('refuses a shared lane that is too short', () => {
        expect(() => createInstances(8, ['iPose'], { iPose: new Float32Array(4) })).toThrow(/under 8/);
    });
});

describe('uploadInstances', () => {
    it('interleaves the written rows, marks only them, caps at capacity and skips the draw at zero', () => {
        const inst = createInstances(4, ['iPose', 'iColor']);
        inst.arrays.iPose.set([1, 2, 3, 4, 5, 6, 7, 8]);
        inst.arrays.iColor.set([9, 9, 9, 9, 8, 8, 8, 8]);
        uploadInstances(inst, 2);
        expect(Array.from(inst.data.slice(0, 16))).toEqual([1, 2, 3, 4, 9, 9, 9, 9, 5, 6, 7, 8, 8, 8, 8, 8]);
        expect(inst.geometry.instanceCount).toBe(2);
        expect(inst.buffer.updateRanges).toEqual([{ start: 0, count: 16 }]);
        expect(inst.buffer.version).toBeGreaterThan(0);
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
