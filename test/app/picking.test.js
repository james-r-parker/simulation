import { describe, expect, it } from 'vitest';
import { largestOfLineage, pickAgent, PICK_TOLERANCE_PX } from '../../js/app/picking.js';

const agents = {
    count: 3,
    x: Float32Array.from([100, 130, 500]),
    y: Float32Array.from([100, 100, 500]),
    size: Float32Array.from([20, 20, 20]),
    spec: Uint32Array.from([0, 1, 0]),
    genomeId: Uint32Array.from([11, 22, 33]),
};

describe('pickAgent', () => {
    it('returns the genome id of the agent under the click', () => {
        expect(pickAgent(agents, 505, 500, { zoom: 1, minPx: [] })).toBe(33);
    });

    it('returns the nearest when two bodies overlap the click', () => {
        expect(pickAgent(agents, 112, 100, { zoom: 1, minPx: [] })).toBe(11);
        expect(pickAgent(agents, 120, 100, { zoom: 1, minPx: [] })).toBe(22);
    });

    it('widens the body by the tolerance in device pixels, which is more world units when zoomed out', () => {
        expect(pickAgent(agents, 100, 100 + 20 + PICK_TOLERANCE_PX - 1, { zoom: 1, minPx: [] })).toBe(11);
        expect(pickAgent(agents, 100, 100 + 20 + PICK_TOLERANCE_PX + 1, { zoom: 1, minPx: [] })).toBe(0);
        expect(pickAgent(agents, 500 + 20 + PICK_TOLERANCE_PX - 1, 500, { zoom: 1, minPx: [] })).toBe(33);
        expect(pickAgent(agents, 500 + 20 + PICK_TOLERANCE_PX + 1, 500, { zoom: 1, minPx: [] })).toBe(0);
        expect(pickAgent(agents, 500 + 20 + PICK_TOLERANCE_PX + 1, 500, { zoom: 0.5, minPx: [] })).toBe(33);
    });

    it('returns 0 for empty space and for no agents', () => {
        expect(pickAgent(agents, 900, 900, { zoom: 1, minPx: [] })).toBe(0);
        expect(pickAgent({ ...agents, count: 0 }, 100, 100, { zoom: 1, minPx: [] })).toBe(0);
    });

    it('tests a small agent at the radius it is drawn at, a hunter wider than another type', () => {
        const apart = {
            count: 2,
            x: Float32Array.from([100, 500]),
            y: Float32Array.from([100, 100]),
            size: Float32Array.from([1, 1]),
            spec: Uint32Array.from([0, 1]),
            genomeId: Uint32Array.from([11, 22]),
        };
        const view = { zoom: 0.5, minPx: [16, 12] };
        // the hunter is drawn 16 / (2 x 0.5) = 16 world units in radius, the other type 12
        expect(pickAgent(apart, 100 + 16 + PICK_TOLERANCE_PX / 0.5 - 1, 100, view)).toBe(11);
        expect(pickAgent(apart, 100 + 16 + PICK_TOLERANCE_PX / 0.5 + 1, 100, view)).toBe(0);
        expect(pickAgent(apart, 500 + 12 + PICK_TOLERANCE_PX / 0.5 - 1, 100, view)).toBe(22);
        expect(pickAgent(apart, 500 + 12 + PICK_TOLERANCE_PX / 0.5 + 1, 100, view)).toBe(0);
    });
});

describe('largestOfLineage', () => {
    const family = {
        count: 4,
        size: Float32Array.from([5, 9, 9, 20]),
        lineageId: Uint32Array.from([1, 1, 1, 2]),
        genomeId: Uint32Array.from([10, 20, 30, 40]),
    };

    it('finds the largest agent of a family, the first of equals', () => {
        expect(largestOfLineage(family, 1)).toBe(20);
        expect(largestOfLineage(family, 2)).toBe(40);
    });

    it('returns 0 for a family with no agent alive', () => {
        expect(largestOfLineage(family, 7)).toBe(0);
        expect(largestOfLineage({ ...family, count: 0 }, 1)).toBe(0);
    });
});
