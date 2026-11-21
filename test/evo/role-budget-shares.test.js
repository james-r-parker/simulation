// reads: evals/fair-chase/courser.json
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { chaseCells } from '../../js/evo/role-budget-check.js';
import { catchShares } from '../../js/evo/role-budget-shares.js';

/** @param {number} bearing @param {number | null} formula @param {number | null} sim @param {boolean} [edge] */
const cell = (bearing, formula, sim, edge = false) => ({ bearing, formula, sim, edge });

describe('catchShares', () => {
    it('reads the share of start distances that kill, per bearing, for the formula and the sim', () => {
        const cells = [cell(0, 10, 10), cell(0, 20, null), cell(0, null, null), cell(1, 5, 5), cell(1, 6, 6)];
        const s = catchShares(cells);
        expect(s.bearings.map((b) => [b.bearing, b.formula, b.sim])).toEqual([
            [0, 2 / 3, 1 / 3],
            [1, 1, 1],
        ]);
        expect(s.bearings.every((b) => !b.signDrift)).toBe(true);
    });

    it('finds no drift when the formula and the sim share the same kills', () => {
        const cells = [cell(0, 1, 1), cell(0, null, null), cell(1, 1, 1), cell(1, 1, 1), cell(2, null, null)];
        expect(catchShares(cells).drift).toBe(0);
    });

    it('finds a sign drift when only one side kills at a bearing', () => {
        const s = catchShares([cell(0, 1, null), cell(0, 2, null), cell(1, null, null)]);
        expect(s.bearings[0].signDrift).toBe(true);
        expect(s.bearings[1].signDrift).toBe(false);
        expect(s.drift).toBeGreaterThanOrEqual(1);
    });

    it('finds a rank drift when the formula orders two bearings against the sim', () => {
        // formula: bearing 0 above bearing 1; sim: bearing 1 above bearing 0, both above 0 so no sign drift
        const against = catchShares([
            cell(0, 1, null),
            cell(0, 1, null),
            cell(0, 1, 1),
            cell(1, 1, 1),
            cell(1, 1, 1),
            cell(1, null, 1),
        ]);
        expect(against.bearings.map((b) => [b.formula, b.sim])).toEqual([
            [1, 1 / 3],
            [2 / 3, 1],
        ]);
        expect(against.bearings.map((b) => b.signDrift)).toEqual([false, false]);
        expect(against.rankDrift).toBe(1);
    });

    it('does not read a tie as a rank drift, nor the cells at the view edge', () => {
        expect(catchShares([cell(0, 1, 1), cell(1, 1, 1)]).rankDrift).toBe(0);
        const s = catchShares([cell(0, 1, 1), cell(0, 1, null, true), cell(1, null, null)]);
        expect(s.bearings[0]).toMatchObject({ formula: 1, sim: 1 });
    });
});

describe('catchShares on the courser arm', () => {
    it('agrees with the sim at every bearing: the cells of the cross-check kill together', () => {
        const courser = arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8')));
        const cells = chaseCells(courser, { hunter: 'predator', prey: 'forager', straight: false }, [0.2, 0.6]);
        const s = catchShares(cells);
        expect(s.bearings).toHaveLength(8);
        expect(s.drift).toBe(0);
    });
});
