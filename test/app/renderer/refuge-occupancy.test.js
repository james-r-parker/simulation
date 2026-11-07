import { describe, expect, it } from 'vitest';
import {
    createRefugeOccupancy,
    REFUGE_COUNT_MS,
    REFUGE_FULL_COUNT,
    REFUGE_SMOOTHING,
    stepRefugeOccupancy,
} from '../../../js/app/renderer/refuge-occupancy.js';

/**
 * @param {number[][]} points x, y pairs
 * @returns {{count: number, x: Float32Array, y: Float32Array}} agents
 */
function agentsAt(points) {
    return {
        count: points.length,
        x: Float32Array.from(points.map((p) => p[0])),
        y: Float32Array.from(points.map((p) => p[1])),
    };
}

const discs = [
    { x: 0, y: 0, radius: 100 },
    { x: 1000, y: 0, radius: 100 },
];

describe('stepRefugeOccupancy', () => {
    it('lights only the disc with blobs in it, in proportion to the count', () => {
        const state = createRefugeOccupancy({ terrain: { refuges: discs } });
        const three = agentsAt([
            [0, 0],
            [50, 50],
            [-99, 0],
            [500, 500],
        ]);
        expect(stepRefugeOccupancy(state, three, 0)).toBe(true);
        expect(state.level[0]).toBeCloseTo((3 / REFUGE_FULL_COUNT) * REFUGE_SMOOTHING, 5);
        expect(state.level[1]).toBe(0);
    });

    it('counts only once per interval', () => {
        const state = createRefugeOccupancy({ terrain: { refuges: discs } });
        const one = agentsAt([[0, 0]]);
        stepRefugeOccupancy(state, one, 0);
        const before = state.level[0];
        expect(stepRefugeOccupancy(state, one, REFUGE_COUNT_MS - 1)).toBe(false);
        expect(state.level[0]).toBe(before);
        expect(stepRefugeOccupancy(state, one, REFUGE_COUNT_MS)).toBe(true);
        expect(state.level[0]).toBeGreaterThan(before);
    });

    it('saturates at 1, then drains to 0 and reports no change once settled', () => {
        const state = createRefugeOccupancy({ terrain: { refuges: discs } });
        const crowd = agentsAt(Array.from({ length: 20 }, () => [10, 10]));
        let t = 0;
        for (let i = 0; i < 40; i++, t += REFUGE_COUNT_MS) {
            stepRefugeOccupancy(state, crowd, t);
        }
        expect(state.level[0]).toBe(1);
        const empty = agentsAt([]);
        for (let i = 0; i < 40; i++, t += REFUGE_COUNT_MS) {
            stepRefugeOccupancy(state, empty, t);
        }
        expect(state.level[0]).toBe(0);
        expect(stepRefugeOccupancy(state, empty, t)).toBe(false);
    });
});
