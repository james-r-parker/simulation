import { describe, expect, it } from 'vitest';
import { mountWorldTab } from '../../../js/app/ui/insights-world.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

describe('the World tab', () => {
    it('shows the readings, the population and the births and deaths of the last four seasons', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const tab = mountWorldTab(doc, panel);
        tab.update({
            readings: [
                ['season', 'Summer, year 1 (25%)'],
                ['hunters alive', '3'],
            ],
            population: [{ cells: ['forager', '9'] }],
            births: [{ cells: ['mate', '1', '2', '3', '4'] }],
            deaths: [{ cells: ['starved', '5', '6', '7', '8'] }],
        });
        const headings = byClass(panel, 'insights-heading').map((h) => h.textContent);
        expect(headings).toEqual(['Population by type', 'Births per season', 'Deaths per season']);
        const rows = byClass(panel, 'insights-row').map((r) => r.children.map((/** @type {any} */ c) => c.textContent));
        expect(rows).toEqual([
            ['season', 'Summer, year 1 (25%)'],
            ['hunters alive', '3'],
            ['forager', '9'],
            ['mate', '1', '2', '3', '4'],
            ['starved', '5', '6', '7', '8'],
        ]);
        const flowHeads = byClass(panel, 'insights-section')[2].children[1].children[0].children;
        expect(flowHeads.map((/** @type {any} */ c) => c.textContent)).toEqual(['cause', 'now', '-1', '-2', '-3']);
    });

    it('leaves a root for the charts', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const tab = mountWorldTab(doc, panel);
        expect(byClass(panel, 'insights-charts')[0]).toBe(tab.chartsRoot);
    });
});
