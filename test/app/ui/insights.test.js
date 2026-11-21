import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, mountInsights, TABS, tabOrDefault } from '../../../js/app/ui/insights.js';
import { INSIGHTS_TABS } from '../../../js/app/prefs.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

const WORLD = {
    readings: [['tick', '5']],
    population: [{ cells: ['forager', '9'] }],
    births: [{ cells: ['mate', '1', '0', '0', '0'] }],
    deaths: [{ cells: ['starved', '2', '0', '0', '0'] }],
};

/** @param {Record<string, any>} [options] mount options @returns {any} the drawer body and its insights */
function setup(options = {}) {
    const doc = fakeDocument();
    const root = doc.createElement('div');
    const tabs = /** @type {string[]} */ ([]);
    const insights = mountInsights(doc, root, { onTab: (id) => tabs.push(id), ...options });
    return { root, insights, tabs };
}

describe('the insights drawer', () => {
    it('lists the tabs the preference accepts', () => {
        expect(TABS.map((t) => t.id)).toEqual(INSIGHTS_TABS.slice(0, TABS.length));
        expect(TABS.map((t) => t.label)).toEqual(['World', 'Scenes', 'Families', 'Records', 'Export']);
        expect(tabOrDefault('reel')).toBe(DEFAULT_TAB);
        expect(tabOrDefault('world')).toBe('world');
    });

    it('shows the World tab first with its readings, population and flows from the view', () => {
        const { root, insights } = setup();
        insights.update({ world: WORLD });
        expect(insights.tab()).toBe('world');
        const text = byClass(root, 'insights-world')[0];
        const cells = byClass(text, 'insights-row').map((r) => r.children.map((/** @type {any} */ c) => c.textContent));
        expect(cells).toEqual([
            ['tick', '5'],
            ['forager', '9'],
            ['mate', '1', '0', '0', '0'],
            ['starved', '2', '0', '0', '0'],
        ]);
        expect(byClass(root, 'insights-tab')[0].getAttribute('aria-selected')).toBe('true');
        expect(insights.chartsRoot().className).toBe('insights-charts');
    });

    it('opens on a given tab, ignores an unknown tab and reports a change once', () => {
        const { insights, tabs } = setup({ tab: 'nonsense' });
        expect(insights.tab()).toBe('world');
        insights.setTab('nonsense');
        insights.setTab('world');
        expect(tabs).toEqual([]);
    });

    it('fills every panel on the board, and only the shown one otherwise', () => {
        const { root, insights } = setup();
        const [panel] = byClass(root, 'insights-world');
        insights.setBoard(true);
        expect(insights.board()).toBe(true);
        expect(root.classList.contains('insights-board')).toBe(true);
        expect(panel.hidden).toBe(false);
        insights.setBoard(false);
        expect(root.classList.contains('insights-board')).toBe(false);
    });

    it('shows a tab by clicking its button', () => {
        const { root } = setup();
        expect(() => byClass(root, 'insights-tab')[0].dispatch('click')).not.toThrow();
    });
});
