import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInterpolated } from '../../js/app/interpolate.js';
import { BOARD_CLASS, INSIGHTS_DRAWER } from '../../js/app/interface-insights.js';
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

    it('shows the families and the records from the stats, and follows a family or a living holder when clicked', () => {
        const targets = /** @type {any[]} */ ([]);
        const stored = { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'families' }) };
        const { ui, elements } = setup({ stored, deps: { followTarget: (/** @type {any} */ t) => targets.push(t) } });
        ui.listeners.onReady(ready);
        const record = { value: 7, genomeId: 31, alive: true };
        ui.listeners.onStats({
            tick: 10,
            ticksPerSecond: 60,
            lineages: { top: [{ id: 4, share: 0.5 }] },
            families: [
                {
                    id: 4,
                    count: 3,
                    share: 0.5,
                    oldestGenomeId: 300,
                    oldestAgeTicks: 36000,
                    bySpec: [3, 0, 0, 0, 0],
                    kills: 2,
                    deepest: 4,
                },
            ],
            records: {
                longestLife: record,
                mostKills: { ...record, alive: false },
                mostChildren: { value: 0, genomeId: 0, alive: false },
            },
        });
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const families = byClass(byClass(elements.drawers, 'insights-families')[0], 'insights-row');
        expect(families).toHaveLength(1);
        expect(families[0].children[1].textContent).toBe('3 (50%)');
        families[0].dispatch('click');
        byClass(elements.drawers, 'insights-tab')[3].dispatch('click');
        const records = byClass(byClass(elements.drawers, 'insights-records')[0], 'insights-row');
        expect(records.map((r) => r.children[2].textContent)).toEqual(['blob 31', 'blob 31 (gone)', '-', '-']);
        records.forEach((r) => r.dispatch('click'));
        expect(targets).toEqual([
            { kind: 'family', genomeId: 300 },
            { kind: 'record', genomeId: 31 },
        ]);
    });

    it('shows the longest chase the frame saw, and follows its hunter while it is in the frame', () => {
        const agents = createInterpolated(8);
        agents.count = 1;
        agents.genomeId[0] = 60;
        const state = { pursuits: { count: 1, hunter: Int32Array.of(0) } };
        const targets = /** @type {any[]} */ ([]);
        const stored = { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'records' }) };
        const { ui, elements, setClock } = setup({
            stored,
            deps: {
                getAgents: () => agents,
                getPursuits: () => state.pursuits,
                followTarget: (/** @type {any} */ t) => targets.push(t),
            },
        });
        ui.listeners.onReady(ready);
        const none = { value: 0, genomeId: 0, alive: false };
        ui.listeners.onStats({
            tick: 0,
            ticksPerSecond: 60,
            records: { longestLife: none, mostKills: none, mostChildren: none },
        });
        ui.tick(0);
        ui.listeners.onStats({
            tick: 1200,
            ticksPerSecond: 60,
            records: { longestLife: none, mostKills: none, mostChildren: none },
        });
        ui.tick(100);
        state.pursuits = { count: 0, hunter: new Int32Array(1) };
        ui.tick(2000);
        ui.tick(4000);
        setClock(4000);
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const rows = byClass(byClass(elements.drawers, 'insights-records')[0], 'insights-row');
        expect(rows[3].children.map((/** @type {any} */ c) => c.textContent)).toEqual([
            'longest chase',
            '20 s',
            'blob 60',
        ]);
        rows[3].dispatch('click');
        expect(targets).toEqual([{ kind: 'record', genomeId: 60 }]);
    });

    it('downloads the drawer tables as CSV and copies the replay command from the Export tab', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const copied = /** @type {string[]} */ ([]);
        const stored = { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'export' }) };
        const { ui, elements, files } = setup({
            stored,
            deps: { copyText: (/** @type {string} */ t) => (copied.push(t), Promise.resolve()) },
        });
        ui.listeners.onReady(ready);
        ui.listeners.onStats({ tick: 77, ticksPerSecond: 60, population: 3, bySpec: [3, 0, 0, 0, 0] });
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        const panel = byClass(elements.drawers, 'insights-export')[0].parent;
        expect(byClass(panel, 'insights-command')[0].textContent).toContain(`--seed ${ready.seed}`);
        expect(byClass(panel, 'insights-command')[0].textContent).toContain('--ticks 77');
        expect(byClass(panel, 'insights-config')[0].textContent).toBe('{\n  "maxAgents": 40\n}');
        byClass(panel, 'insights-export-csv')[0].dispatch('click');
        expect(files[0].name).toBe(`blob-insights-${ready.seed}-77.csv`);
        expect(files[0].text).toContain('# scenes\nscene,last 4 seasons\nLeave a dying patch,no live signal');
        expect(files[0].text).toContain('# population by type\ntype,alive\nforager,3');
        byClass(panel, 'insights-export-command')[0].dispatch('click');
        await Promise.resolve();
        await Promise.resolve();
        expect(copied[0]).toContain('--ticks 77');
        expect(byClass(elements.hud, 'toast').map((t) => t.textContent)).toEqual([
            'Tables saved',
            'Replay command copied',
        ]);
    });

    it('treats a missing pursuit table as no pursuits', () => {
        const agents = createInterpolated(8);
        const { ui } = setup({ deps: { getAgents: () => agents } });
        ui.listeners.onReady(ready);
        expect(() => ui.tick(100)).not.toThrow();
    });

    it('opens the board with every tab filled, the world small in a corner, and closes it with a second press', async () => {
        FakeUPlot.made.length = 0;
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { ui, elements, doc } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onStats({ tick: 5, ticksPerSecond: 60, population: 9 });
        ui.hooks.toggleBoard();
        await Promise.resolve();
        await Promise.resolve();
        const drawer = byClass(elements.drawers, 'drawer-insights')[0];
        expect(drawer.classList.contains('open')).toBe(true);
        expect(drawer.classList.contains('insights-board')).toBe(true);
        expect(doc.documentElement.classList.contains(BOARD_CLASS)).toBe(true);
        expect(byClass(elements.drawers, 'insights-panel').map((p) => p.hidden)).toEqual([
            false,
            false,
            false,
            false,
            false,
            false,
        ]);
        expect(readings(elements).population).toBe('9');
        expect(FakeUPlot.made).toHaveLength(5);
        expect(info).toHaveBeenCalledWith({ level: 'info', event: 'InsightsOpened', tab: 'world', board: true });
        ui.hooks.toggleBoard();
        expect(drawer.classList.contains('open')).toBe(false);
        expect(drawer.classList.contains('insights-board')).toBe(false);
        expect(doc.documentElement.classList.contains(BOARD_CLASS)).toBe(false);
        expect(FakeUPlot.made.every((u) => u.destroyed)).toBe(true);
    });

    it('turns the open drawer into the board, and leaves the board when the drawer closes any other way', async () => {
        const { ui, elements, doc } = setup();
        ui.listeners.onReady(ready);
        await open(ui);
        ui.hooks.toggleBoard();
        expect(byClass(elements.drawers, 'drawer-insights')[0].classList.contains('insights-board')).toBe(true);
        ui.hooks.toggleDrawer(INSIGHTS_DRAWER);
        expect(doc.documentElement.classList.contains(BOARD_CLASS)).toBe(false);
        expect(ui.hooks.closeDrawer()).toBe(false);
    });

    it('starts as the board when ?board=1 asked for it', () => {
        const { elements, doc } = setup({ deps: { board: true } });
        expect(byClass(elements.drawers, 'drawer-insights')[0].classList.contains('open')).toBe(true);
        expect(doc.documentElement.classList.contains(BOARD_CLASS)).toBe(true);
    });

    it('sizes the HUD for the whole page while the canvas is a corner', () => {
        const { ui, doc, width } = setup();
        width.value = 480;
        doc.documentElement.clientWidth = 3840;
        ui.resize();
        expect(doc.documentElement.style.fontSize).toBe('32px');
    });
});
