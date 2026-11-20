import { describe, expect, it } from 'vitest';
import { ELITE_BAR, eliteSkill } from '../../js/evo/elite-skill.js';

/** @param {number} win @param {number} [edgeLow] @returns {{winShare: number, edgeLow?: number}} a cell */
const cell = (win, edgeLow) => (edgeLow === undefined ? { winShare: win } : { winShare: win, edgeLow });

describe('eliteSkill', () => {
    it('counts the elites clearing the bar and says whether the highest lower bound is one', () => {
        const rows = [
            { cells: { a: cell(0.9, 0.5) } },
            { cells: { a: cell(0.5, 0.3) } },
            { cells: { a: cell(0.1, 0.0) } },
            { cells: { a: cell(0, 0) } }, // the reference row, beyond the subjects
        ];
        const subjects = [{ lowerBound: 1 }, { lowerBound: 3 }, { lowerBound: 2 }];
        const read = eliteSkill(rows, subjects).a;
        expect(read).toMatchObject({ drilled: 3, clearing: 2, topClears: true });
        expect(read.clearShare).toBeCloseTo(2 / 3);
        expect(eliteSkill(rows, subjects, { bar: 0.4 }).a).toMatchObject({ clearing: 1, topClears: false });
        expect(ELITE_BAR).toBe(0.3);
    });

    it('reads a positive rho when lower bound tracks wins and a negative one when it opposes them', () => {
        const subjects = [{ lowerBound: 1 }, { lowerBound: 2 }, { lowerBound: 3 }];
        const up = [0.1, 0.5, 0.9].map((w) => ({ cells: { a: cell(w, w) } }));
        const down = [0.9, 0.5, 0.1].map((w) => ({ cells: { a: cell(w, w) } }));
        expect(eliteSkill(up, subjects).a.spearman).toBeCloseTo(1);
        expect(eliteSkill(down, subjects).a.spearman).toBeCloseTo(-1);
    });

    it('writes null for a constant sample, one elite and none, and skips elites that ran no such drill', () => {
        const flat = [0.5, 0.5].map((w) => ({ cells: { a: cell(w, 0.4) } }));
        expect(eliteSkill(flat, [{ lowerBound: 1 }, { lowerBound: 2 }]).a.spearman).toBeNull();
        const skipped = [{ cells: { a: null, b: cell(0.5, 0.4) } }, { cells: { a: cell(0.2, 0.1), b: null } }];
        const read = eliteSkill(skipped, [{ lowerBound: 1 }, { lowerBound: 2 }], { drills: ['a', 'b', 'c'] });
        expect(read.a).toMatchObject({ drilled: 1, clearing: 0, topClears: false, spearman: null });
        expect(read.b).toMatchObject({ drilled: 1, clearing: 1, topClears: true });
        expect(read.c).toEqual({ drilled: 0, clearing: 0, clearShare: null, topClears: null, spearman: null });
        expect(eliteSkill([], [])).toEqual({});
    });

    it('treats a missing lower bound as 0 and a missing edgeLow as not clearing', () => {
        const rows = [{ cells: { a: cell(0.9) } }, { cells: { a: cell(0.8, 0.5) } }];
        expect(eliteSkill(rows, [{}, { lowerBound: -1 }]).a).toMatchObject({ clearing: 1, topClears: false });
    });
});
