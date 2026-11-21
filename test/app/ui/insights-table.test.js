import { describe, expect, it } from 'vitest';
import { mountTable } from '../../../js/app/ui/insights-table.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

/** @param {Record<string, any>} [options] extra table options @returns {any} a table in a fake document */
function setup(options = {}) {
    const doc = fakeDocument();
    const parent = doc.createElement('div');
    const picks = /** @type {any[]} */ ([]);
    const table = mountTable(doc, parent, { columns: ['name', 'n'], onPick: (t) => picks.push(t), ...options });
    return { table, parent, picks };
}

/** @param {any} parent @returns {string[][]} the visible rows' cell texts */
function shown(parent) {
    return byClass(parent, 'insights-row')
        .filter((r) => !r.hidden)
        .map((r) => r.children.map((/** @type {any} */ c) => c.textContent));
}

describe('mountTable', () => {
    it('writes a heading row once and a row per entry, hiding the surplus when the rows shrink', () => {
        const { table, parent } = setup({ title: 'Population' });
        expect(byClass(parent, 'insights-heading')[0].textContent).toBe('Population');
        table.update([{ cells: ['a', '1'] }, { cells: ['b', '2'] }, { cells: ['c', '3'] }]);
        expect(shown(parent)).toEqual([
            ['a', '1'],
            ['b', '2'],
            ['c', '3'],
        ]);
        table.update([{ cells: ['a', '9'] }]);
        expect(shown(parent)).toEqual([['a', '9']]);
        expect(table.rows()).toBe(1);
        expect(byClass(parent, 'insights-row')).toHaveLength(3);
    });

    it('leaves out the heading row when every column heading is empty', () => {
        const { parent } = setup({ columns: ['', ''] });
        expect(parent.children[0].children[0].children).toHaveLength(0);
    });

    it('reports a clickable row to onPick, with its target, and ignores the others', () => {
        const { table, parent, picks } = setup();
        table.update([
            { cells: ['a', '1'], pick: true, target: { genomeId: 7 } },
            { cells: ['b', '2'], target: { genomeId: 8 } },
        ]);
        const [first, second] = byClass(parent, 'insights-row');
        first.dispatch('click');
        second.dispatch('click');
        first.dispatch('keydown', { key: 'Enter' });
        first.dispatch('keydown', { key: 'x' });
        expect(picks).toEqual([{ genomeId: 7 }, { genomeId: 7 }]);
        expect(first.classList.contains('pick')).toBe(true);
        expect(first.getAttribute('role')).toBe('button');
        expect(second.classList.contains('pick')).toBe(false);
    });

    it('marks muted rows and sets the swatch colour', () => {
        const { table, parent } = setup();
        table.update([{ cells: ['a', 'no live signal'], muted: true, color: 'rgb(1, 2, 3)' }]);
        const [row] = byClass(parent, 'insights-row');
        expect(row.classList.contains('muted')).toBe(true);
        expect(row.style['--swatch']).toBe('rgb(1, 2, 3)');
    });

    it('does not need an onPick handler', () => {
        const { table, parent } = setup({ onPick: undefined });
        table.update([{ cells: ['a', '1'], pick: true }]);
        expect(() => byClass(parent, 'insights-row')[0].dispatch('click')).not.toThrow();
    });
});
