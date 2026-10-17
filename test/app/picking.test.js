import { describe, expect, it } from 'vitest';
import { pickAgent, PICK_TOLERANCE_PX } from '../../js/app/picking.js';

const agents = {
    count: 3,
    x: Float32Array.from([100, 130, 500]),
    y: Float32Array.from([100, 100, 500]),
    size: Float32Array.from([20, 20, 20]),
    genomeId: Uint32Array.from([11, 22, 33]),
};

describe('pickAgent', () => {
    it('returns the genome id of the agent under the click', () => {
        expect(pickAgent(agents, 505, 500, 1)).toBe(33);
    });

    it('returns the nearest when two bodies overlap the click', () => {
        expect(pickAgent(agents, 112, 100, 1)).toBe(11);
        expect(pickAgent(agents, 120, 100, 1)).toBe(22);
    });

    it('widens the body by the tolerance in device pixels, which is more world units when zoomed out', () => {
        expect(pickAgent(agents, 100, 100 + 20 + PICK_TOLERANCE_PX - 1, 1)).toBe(11);
        expect(pickAgent(agents, 100, 100 + 20 + PICK_TOLERANCE_PX + 1, 1)).toBe(0);
        expect(pickAgent(agents, 500 + 20 + PICK_TOLERANCE_PX - 1, 500, 1)).toBe(33);
        expect(pickAgent(agents, 500 + 20 + PICK_TOLERANCE_PX + 1, 500, 1)).toBe(0);
        expect(pickAgent(agents, 500 + 20 + PICK_TOLERANCE_PX + 1, 500, 0.5)).toBe(33);
    });

    it('returns 0 for empty space and for no agents', () => {
        expect(pickAgent(agents, 900, 900, 1)).toBe(0);
        expect(pickAgent({ ...agents, count: 0 }, 100, 100, 1)).toBe(0);
    });
});
