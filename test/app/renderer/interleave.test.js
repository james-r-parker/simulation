import { describe, expect, it } from 'vitest';
import { interleaveRows, VEC4 } from '../../../js/app/renderer/interleave.js';

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
