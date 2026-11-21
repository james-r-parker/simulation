import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInterpolated } from '../../js/app/interpolate.js';
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
        const { ui, setClock } = setup();
        ui.listeners.onReady(ready);
        for (const [i, id] of [4, 4].entries()) {
            setClock(i * 6000);
            ui.listeners.onStats({ tick: i * 3600, ticksPerSecond: 60, lineages: { top: [{ id, share: 0.5 }] } });
        }
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

    it('switches tabs, remembers the tab, and keeps the charts only on the World tab', async () => {
        FakeUPlot.made.length = 0;
        const { ui, elements, store } = setup();
        ui.listeners.onReady(ready);
        await open(ui);
        expect(FakeUPlot.made).toHaveLength(5);
        byClass(elements.drawers, 'insights-tab')[1].dispatch('click');
        expect(FakeUPlot.made.every((u) => u.destroyed)).toBe(true);
        expect(JSON.parse(store.get(PREFS_KEY) ?? '{}').insightsTab).toBe('scenes');
        expect(byClass(elements.drawers, 'insights-scenes')[0].hidden).toBe(false);
        expect(byClass(elements.drawers, 'insights-world')[0].hidden).toBe(true);
        byClass(elements.drawers, 'insights-tab')[0].dispatch('click');
        await Promise.resolve();
        expect(FakeUPlot.made).toHaveLength(10);
    });

    it('counts the effects it hears and shows them on the Scenes tab, with no live signal for the rest', () => {
        const { ui, elements } = setup({
            stored: { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'scenes' }) },
        });
        ui.listeners.onReady(ready);
        ui.onEffect({ kind: ready.layout.effectKinds.ALARM, tick: 5, x: 1, y: 2, a: 77, b: 0, c: 0, d: 0 });
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const [panel] = byClass(elements.drawers, 'insights-scenes');
        const rows = byClass(panel, 'insights-row').map((r) => r.children.map((/** @type {any} */ c) => c.textContent));
        expect(rows).toHaveLength(15);
        expect(rows).toContainEqual(["Call, or don't", '1']);
        expect(rows).toContainEqual(['Abort', '0']);
        expect(rows.filter((r) => r[1] === 'no live signal')).toHaveLength(6);
    });

    it('follows a scene instance when its row is clicked', () => {
        const targets = /** @type {any[]} */ ([]);
        const { ui, elements } = setup({
            stored: { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'scenes' }) },
            deps: { followTarget: (/** @type {any} */ t) => targets.push(t) },
        });
        ui.listeners.onReady(ready);
        ui.onEffect({ kind: ready.layout.effectKinds.PACK_CALL, tick: 5, x: 3, y: 4, a: 88, b: 0, c: 0, d: 0 });
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const rows = byClass(byClass(elements.drawers, 'insights-scenes')[0], 'insights-row');
        rows.forEach((r) => r.dispatch('click'));
        expect(targets).toEqual([{ kind: 'scene', name: 'Pack, or loner', genomeId: 88, x: 3, y: 4 }]);
    });

    it('does not fail on a click with no follow handler', () => {
        const { ui, elements } = setup({
            stored: { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'scenes' }) },
        });
        ui.listeners.onReady(ready);
        ui.onEffect({ kind: ready.layout.effectKinds.ALARM, tick: 5, x: 1, y: 2, a: 77, b: 0, c: 0, d: 0 });
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const rows = byClass(byClass(elements.drawers, 'insights-scenes')[0], 'insights-row');
        expect(() => rows.forEach((r) => r.dispatch('click'))).not.toThrow();
    });

    it('counts the pursuits in each frame it is ticked with, without the drawer being open', () => {
        const agents = createInterpolated(8);
        agents.count = 1;
        agents.genomeId[0] = 60;
        const pursuits = { count: 1, hunter: Int32Array.of(0) };
        const { ui, elements } = setup({
            stored: { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'scenes' }) },
            deps: { getAgents: () => agents, getPursuits: () => pursuits },
        });
        ui.listeners.onReady(ready);
        ui.tick(100);
        ui.tick(116);
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const rows = byClass(byClass(elements.drawers, 'insights-scenes')[0], 'insights-row');
        expect(rows[1].children.map((/** @type {any} */ c) => c.textContent)).toEqual(['A real chase', '1']);
    });

    it('treats a missing pursuit table as no pursuits', () => {
        const agents = createInterpolated(8);
        const { ui } = setup({ deps: { getAgents: () => agents } });
        ui.listeners.onReady(ready);
        expect(() => ui.tick(100)).not.toThrow();
    });
});
