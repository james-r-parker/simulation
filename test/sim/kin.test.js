import { describe, expect, it } from 'vitest';
import { isKin } from '../../js/sim/kin.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {number[][]} rows genomeId, parentA, parentB per slot
 * @returns {ReturnType<typeof smallWorld>}
 */
function build(rows) {
    const w = smallWorld();
    rows.forEach(([g, a, b], i) => {
        w.genomeId[i] = g;
        w.parentA[i] = a;
        w.parentB[i] = b;
    });
    return w;
}

describe('isKin', () => {
    it('treats a parent and child as kin either way', () => {
        const w = build([
            [1, 0, 0],
            [3, 1, 2],
            [4, 9, 1],
        ]);
        expect(isKin(w, 0, 1)).toBe(true);
        expect(isKin(w, 1, 0)).toBe(true);
        expect(isKin(w, 0, 2)).toBe(true);
        expect(isKin(w, 2, 0)).toBe(true);
    });

    it('treats siblings sharing a parent as kin', () => {
        const w = build([
            [10, 1, 2],
            [11, 1, 3],
            [12, 4, 2],
            [13, 5, 1],
        ]);
        expect(isKin(w, 0, 1)).toBe(true);
        expect(isKin(w, 0, 2)).toBe(true);
        expect(isKin(w, 0, 3)).toBe(true);
        expect(isKin(w, 2, 3)).toBe(false);
    });

    it('does not treat grandparents, cousins or strangers as kin', () => {
        const w = build([
            [1, 0, 0],
            [5, 1, 2],
            [9, 5, 6],
            [6, 3, 4],
            [7, 3, 8],
            [20, 5, 4],
            [21, 6, 7],
            [30, 40, 50],
        ]);
        expect(isKin(w, 0, 2)).toBe(false);
        expect(isKin(w, 5, 6)).toBe(false);
        expect(isKin(w, 1, 7)).toBe(false);
    });

    it('does not treat zero ids as kin and an agent is not its own kin', () => {
        const w = build([
            [1, 0, 0],
            [2, 0, 0],
        ]);
        expect(isKin(w, 0, 1)).toBe(false);
        expect(isKin(w, 0, 0)).toBe(false);
    });
});
