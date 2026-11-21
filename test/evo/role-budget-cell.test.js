import { describe, expect, it } from 'vitest';
import { SLACK_CAP, cell, rowOf } from '../../js/evo/role-budget-cell.js';

const model = { tightTicks: 5 };

describe('cell', () => {
    it('is ok at the tight threshold or above, tight under it, impossible for null and n/a for undefined', () => {
        expect(cell(5, model).status).toBe('ok');
        expect(cell(4.9, model).status).toBe('tight');
        expect(cell(0, model).status).toBe('tight');
        expect(cell(null, model)).toMatchObject({ status: 'impossible', margin: null });
        expect(cell(undefined, model)).toMatchObject({ status: 'n/a', margin: null });
    });

    it('marks a margin at the cap and carries the unit and the distance', () => {
        expect(cell(SLACK_CAP, model).capped).toBe(true);
        expect(cell(SLACK_CAP - 1, model).capped).toBe(false);
        expect(cell(null, model).capped).toBe(false);
        expect(cell(10, model, { unit: 'px', distance: 12 })).toMatchObject({ unit: 'px', distance: 12 });
        expect(cell(10, model)).toMatchObject({ unit: 'ticks', distance: null, binding: false });
    });
});

describe('rowOf', () => {
    it('names the step of least slack as the binding step and marks its cell', () => {
        const row = rowOf('r', { see: cell(40, model), turn: cell(8, model), run: cell(60, model) });
        expect(row.binding).toBe('turn');
        expect(row.cells.turn.binding).toBe(true);
        expect(row.cells.see.binding).toBe(false);
        expect(row.status).toBe('ok');
    });

    it('is tight when any cell is tight and impossible when any is, binding the first impossible step', () => {
        expect(rowOf('r', { a: cell(40, model), b: cell(2, model) })).toMatchObject({ status: 'tight', binding: 'b' });
        const row = rowOf('r', { a: cell(40, model), b: cell(null, model), c: cell(null, model), d: cell(1, model) });
        expect(row).toMatchObject({ status: 'impossible', binding: 'b' });
    });

    it('leaves out the steps the job does not use, and is n/a with none', () => {
        const row = rowOf('r', { a: cell(undefined, model), b: cell(30, model) });
        expect(row).toMatchObject({ status: 'ok', binding: 'b' });
        expect(rowOf('r', { a: cell(undefined, model) })).toMatchObject({ status: 'n/a', binding: null });
        expect(rowOf('empty', {})).toMatchObject({ status: 'n/a', binding: null });
    });
});
