import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSIGHTS_DRAWER } from '../../js/app/interface-insights.js';
import { PREFS_KEY } from '../../js/app/prefs.js';
import { byClass } from './helpers/fake-dom.js';
import { FakeUPlot, ready, setup } from './helpers/interface-setup.js';

/** @param {any} ui the interface @returns {Promise<void>} opens the drawer and lets uPlot load */
async function open(ui) {
    ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
    await Promise.resolve();
    await Promise.resolve();
}

/** @param {any} elements the page elements @returns {Record<string, string>} the World readings by label */
function readings(elements) {
    const [panel] = byClass(elements.drawers, 'insights-readings');
    return Object.fromEntries(
        byClass(panel, 'insights-row').map((r) => [r.children[0].textContent, r.children[1].textContent]),
    );
}

afterEach(() => vi.restoreAllMocks());

describe('the insights drawer in the interface', () => {
    it('fills the World tab from the stats when it opens, and again at the refresh rate while open', async () => {
        FakeUPlot.made.length = 0;
        const { ui, elements, setClock } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onStats({ tick: 50, ticksPerSecond: 60, population: 7, predators: 2 });
        await open(ui);
        ui.tick(0);
        expect(readings(elements).population).toBe('7');
        ui.listeners.onStats({ tick: 90, ticksPerSecond: 60, population: 11 });
        setClock(500);
        ui.tick(500);
        expect(readings(elements).population).toBe('7');
        setClock(1500);
        ui.tick(1500);
        expect(readings(elements).population).toBe('11');
    });

    it('builds the charts of the World tab in the drawer and destroys them when it closes', async () => {
        FakeUPlot.made.length = 0;
        const { ui } = setup();
        ui.listeners.onReady(ready);
        await open(ui);
        expect(FakeUPlot.made).toHaveLength(5);
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        expect(FakeUPlot.made.every((u) => u.destroyed)).toBe(true);
    });

    it('rebuilds the charts for a new world while it stays open', async () => {
        FakeUPlot.made.length = 0;
        const { ui } = setup();
        ui.listeners.onReady(ready);
        await open(ui);
        ui.listeners.onReady(ready);
        expect(FakeUPlot.made).toHaveLength(10);
        expect(FakeUPlot.made.slice(0, 5).every((u) => u.destroyed)).toBe(true);
    });

    it('costs nothing while closed: no refresh runs and no chart is built', () => {
        FakeUPlot.made.length = 0;
        const { ui, elements } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onStats({ tick: 50, ticksPerSecond: 60, population: 7 });
        ui.tick(5000);
        expect(readings(elements)).toEqual({});
        expect(FakeUPlot.made).toHaveLength(0);
    });

    it('logs the opening, and the drawer is the open one, with the Insights button marked', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { ui, elements } = setup();
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        expect(info).toHaveBeenCalledWith({ level: 'info', event: 'InsightsOpened', tab: 'world', board: false });
        expect(byClass(elements.drawers, 'drawer-insights')[0].classList.contains('open')).toBe(true);
    });

    it('opens on the tab the preference holds', () => {
        const stored = { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'world' }) };
        const { elements } = setup({ stored });
        const tabs = byClass(elements.drawers, 'insights-tab');
        expect(tabs[0].classList.contains('on')).toBe(true);
    });
});
