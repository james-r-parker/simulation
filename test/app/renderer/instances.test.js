import { describe, expect, it } from 'vitest';
import { DynamicDrawUsage } from 'three/webgpu';
import {
    createInstances,
    interleaveRows,
    instancedMesh,
    takeRows,
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

    it('uploads only on a frame that writes: the buffer is not dynamic, so three goes by its version', () => {
        // three re-sends a DynamicDrawUsage buffer on every render, whole once its ranges are spent, so an idle or
        // empty layer cost a full upload each frame (crisp-renderer T24: about 4 MB a frame at 1000 agents)
        const inst = createInstances(4, ['iPose']);
        expect(inst.buffer.usage).not.toBe(DynamicDrawUsage);
        const before = inst.buffer.version;
        uploadInstances(inst, 0);
        expect(inst.buffer.version).toBe(before);
        uploadInstances(inst, 1);
        expect(inst.buffer.version).toBe(before + 1);
    });

    it('builds a mesh that is never culled', () => {
        const inst = createInstances(1, ['iPose']);
        expect(instancedMesh(inst, null).frustumCulled).toBe(false);
    });

    it('hides its mesh while it holds no rows, so three skips the object entirely', () => {
        const inst = createInstances(2, ['iPose']);
        const mesh = instancedMesh(inst, null);
        uploadInstances(inst, 0);
        expect(mesh.visible).toBe(false);
        uploadInstances(inst, 1);
        expect(mesh.visible).toBe(true);
        uploadInstances(inst, 0);
        expect(mesh.visible).toBe(false);
    });
});

/**
 * The copy `uploadInstances` made before `interleaveRows` was split out of it.
 * @param {Float32Array[]} lanes the lanes
 * @param {Float32Array} data the interleaved rows
 * @param {number} n the rows
 * @returns {void}
 */
function oldCopy(lanes, data, n) {
    const stride = lanes.length * VEC4;
    for (let k = 0; k < lanes.length; k++) {
        for (let row = 0; row < n; row++) {
            for (let c = 0; c < VEC4; c++) {
                data[row * stride + k * VEC4 + c] = lanes[k][row * VEC4 + c];
            }
        }
    }
}

describe('interleaveRows', () => {
    it('equals the old copy loop on lanes of distinct values, and writes nothing past the rows asked for', () => {
        const lanes = [0, 1, 2].map((k) => Float32Array.from({ length: 6 * VEC4 }, (_, i) => k * 100 + i + 0.5));
        const want = new Float32Array(6 * 3 * VEC4).fill(-1);
        const got = new Float32Array(6 * 3 * VEC4).fill(-1);
        oldCopy(lanes, want, 4);
        interleaveRows(lanes, got, 4);
        expect(Array.from(got)).toEqual(Array.from(want));
        expect(got[4 * 3 * VEC4]).toBe(-1);
    });

    it('works into a view over shared memory', () => {
        const lanes = [Float32Array.of(1, 2, 3, 4), Float32Array.of(5, 6, 7, 8)];
        const shared = new Float32Array(new SharedArrayBuffer(32));
        interleaveRows(lanes, shared, 1);
        expect(Array.from(shared)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
});

describe('takeRows', () => {
    it('copies interleaved rows, marks only them and shows the mesh, as uploadInstances does', () => {
        const inst = createInstances(4, ['iPose', 'iColor'], {}, { lanes: false });
        expect(inst.lanes).toEqual([]);
        const mesh = instancedMesh(inst, null);
        const rows = Float32Array.from({ length: 32 }, (_, i) => i + 1);
        takeRows(inst, rows, 2);
        expect(Array.from(inst.data.slice(0, 16))).toEqual(Array.from(rows.slice(0, 16)));
        expect(inst.data[16]).toBe(0);
        expect(inst.geometry.instanceCount).toBe(2);
        expect(inst.buffer.updateRanges).toEqual([{ start: 0, count: 16 }]);
        expect(mesh.visible).toBe(true);
        takeRows(inst, rows, 9);
        expect(inst.geometry.instanceCount).toBe(4);
        takeRows(inst, rows, 0);
        expect(inst.geometry.instanceCount).toBe(0);
        expect(mesh.visible).toBe(false);
    });
});
