import { describe, expect, it } from 'vitest';
import { mountFamiliesTab } from '../../../js/app/ui/insights-families.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

describe('the Families tab', () => {
    it('shows the family rows with their colour and hands a clicked family to onPick', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const picks = /** @type {any[]} */ ([]);
        const tab = mountFamiliesTab(doc, panel, { onPick: (t) => picks.push(t) });
        tab.update([
            {
                cells: ['Velari', '30 (25%)', '2.5 seasons', 'forager 20', '12', '7'],
                color: 'rgb(1, 2, 3)',
                pick: true,
                target: { kind: 'family', genomeId: 905 },
            },
            { cells: ['Orrin', '0 (0%)', '-', '', '0', '0'], pick: false },
        ]);
        const rows = byClass(panel, 'insights-row');
        expect(rows[0].children.map((/** @type {any} */ c) => c.textContent)).toEqual([
            'Velari',
            '30 (25%)',
            '2.5 seasons',
            'forager 20',
            '12',
            '7',
        ]);
        expect(rows[0].style['--swatch']).toBe('rgb(1, 2, 3)');
        rows[0].dispatch('click');
        rows[1].dispatch('click');
        expect(picks).toEqual([{ kind: 'family', genomeId: 905 }]);
        const head = byClass(panel, 'insights-section')[0].children[1].children[0].children;
        expect(head.map((/** @type {any} */ c) => c.textContent)).toEqual([
            'family',
            'size',
            'oldest',
            'mix',
            'kills',
            'deepest',
        ]);
        expect(byClass(panel, 'insights-note')[0].textContent).toContain('oldest member');
    });
});
