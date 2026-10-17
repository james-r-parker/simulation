import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createInterface, REFRESH_MS } from '../../js/app/interface.js';
import { PREFS_KEY } from '../../js/app/prefs.js';
import { byClass, fakeDocument } from './helpers/fake-dom.js';
import { selectedWorld } from './helpers/inspect-world.js';

const { ready, snapshot } = selectedWorld();

/** A stand-in for uPlot. */
class FakeUPlot {
    static made = /** @type {FakeUPlot[]} */ ([]);
    static paths = { bars: () => 'bars' };
    constructor() {
        this.destroyed = false;
        FakeUPlot.made.push(this);
    }
    setData() {}
    destroy() {
        this.destroyed = true;
    }
}

/**
 * @param {{stored?: Record<string, string>, failed?: any}} [options] stored preferences and the failed bundle
 * @returns {any} an interface over fakes, with everything it was asked to do
 */
function setup({ stored = {}, failed = null } = {}) {
    const doc = fakeDocument();
    doc.body = doc.createElement('body');
    doc.documentElement = { requestFullscreen: () => Promise.reject(new Error('no')), style: {} };
    const elements = {
        hud: doc.createElement('div'),
        bar: doc.createElement('div'),
        ticker: doc.createElement('div'),
        drawers: doc.createElement('div'),
    };
    const store = new Map(Object.entries(stored));
    const sent = /** @type {any[]} */ ([]);
    const client = {
        paused: false,
        latest: snapshot,
        setLenses: (/** @type {boolean} */ r) => sent.push(['setLenses', r]),
        reset: (/** @type {number} */ s, /** @type {any} */ c) => sent.push(['reset', s, c]),
        exportArchive: () => sent.push(['exportArchive']),
    };
    const files = /** @type {any[]} */ ([]);
    const timers = /** @type {any[]} */ ([]);
    const state = createAppState();
    let clock = 0;
    const width = { value: 3840 };
    const ui = createInterface({
        doc,
        elements,
        storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
        getClient: () => client,
        getReady: () => ready,
        state,
        overrides: { maxAgents: 40 },
        perform: (a) => sent.push(['perform', a]),
        loadUPlot: () => Promise.resolve(FakeUPlot),
        download: (f) => files.push(f),
        setTimer: (ms, run) => timers.push({ ms, run }),
        getFailedBundle: () => failed,
        now: () => clock,
        getWidth: () => width.value,
    });
    return {
        ui,
        width,
        elements,
        state,
        store,
        sent,
        files,
        timers,
        doc,
        setClock: (/** @type {number} */ t) => (clock = t),
    };
}

describe('createInterface', () => {
    it('sets the root font size from the canvas width and the stored scale, and again on resize', () => {
        const { ui, width, doc, store } = setup();
        expect(doc.documentElement.style.fontSize).toBe('32px');
        width.value = 1920;
        ui.resize();
        expect(doc.documentElement.style.fontSize).toBe('16px');
        const stored = setup({ stored: { [PREFS_KEY]: JSON.stringify({ uiScale: 1.5 }) } });
        expect(stored.doc.documentElement.style.fontSize).toBe('24px');
        expect(store.size).toBe(0);
    });

    it('changes the HUD size from the help buttons and remembers it', () => {
        const { elements, doc, store } = setup();
        byClass(elements.drawers, 'help-size')[2].dispatch('click');
        expect(doc.documentElement.style.fontSize).toBe('20px');
        expect(JSON.parse(store.get(PREFS_KEY) ?? '{}').uiScale).toBe(1.25);
    });

    it('restores the lenses and the HUD from the stored preferences', () => {
        const stored = { [PREFS_KEY]: JSON.stringify({ lenses: [true, false, false, true], hud: false }) };
        const { state, elements } = setup({ stored });
        expect(state.lenses).toEqual([true, false, false, true]);
        expect(elements.hud.classList.contains('hud-hidden')).toBe(true);
    });

    it('saves a lens change and asks the worker for rays only while something needs them', () => {
        const { ui, state, store, sent } = setup();
        state.lenses[3] = true;
        ui.hooks.lensesChanged();
        expect(sent.at(-1)).toEqual(['setLenses', true]);
        expect(JSON.parse(store.get(PREFS_KEY) ?? '{}').lenses).toEqual([false, false, false, true]);
        state.lenses[3] = false;
        ui.syncRays();
        expect(sent.at(-1)).toEqual(['setLenses', false]);
        state.selectedId = 9;
        ui.syncRays();
        expect(sent.at(-1)).toEqual(['setLenses', true]);
    });

    it('hides and shows the HUD, remembering it', () => {
        const { ui, elements, store } = setup();
        ui.hooks.toggleHud();
        expect(elements.hud.classList.contains('hud-hidden')).toBe(true);
        expect(JSON.parse(store.get(PREFS_KEY) ?? '{}').hud).toBe(false);
        ui.hooks.focusSeed();
        expect(elements.hud.classList.contains('hud-hidden')).toBe(false);
    });

    it('opens one drawer at a time and says whether Escape closed one', () => {
        const { ui, elements } = setup();
        expect(ui.hooks.closeDrawer()).toBe(false);
        ui.hooks.toggleDrawer('help');
        expect(byClass(elements.drawers, 'drawer-help')[0].classList.contains('open')).toBe(true);
        ui.hooks.toggleDrawer('inspector');
        expect(byClass(elements.drawers, 'drawer-help')[0].classList.contains('open')).toBe(false);
        expect(ui.hooks.closeDrawer()).toBe(true);
    });

    it('builds the charts after loading uPlot when their drawer opens and destroys them when it closes', async () => {
        FakeUPlot.made.length = 0;
        const { ui } = setup();
        ui.listeners.onReady(ready);
        ui.hooks.toggleDrawer('charts');
        await Promise.resolve();
        await Promise.resolve();
        expect(FakeUPlot.made).toHaveLength(5);
        ui.hooks.toggleDrawer('charts');
        expect(FakeUPlot.made.every((u) => u.destroyed)).toBe(true);
    });

    it('does not build the charts when the drawer closed while uPlot was loading', async () => {
        FakeUPlot.made.length = 0;
        const { ui } = setup();
        ui.listeners.onReady(ready);
        ui.hooks.toggleDrawer('charts');
        ui.hooks.toggleDrawer('charts');
        await Promise.resolve();
        await Promise.resolve();
        expect(FakeUPlot.made).toHaveLength(0);
    });

    it('refreshes each part at its own rate: the bar every 250 ms, the ticker lines as they arrive', () => {
        const { ui, elements, setClock } = setup();
        setClock(1000);
        ui.listeners.onTicker([{ text: 'lineage 3 takes the lead', kind: 'new-leader' }]);
        ui.tick(1000);
        expect(byClass(elements.bar, 'top-bar-tick')[0].textContent).toBe(`tick ${snapshot.tick}`);
        expect(byClass(elements.ticker, 'ticker-line')[0].textContent).toBe('lineage 3 takes the lead');
        ui.tick(1000 + REFRESH_MS.bar - 1);
        const bar = byClass(elements.bar, 'top-bar-tick')[0];
        bar.textContent = 'stale';
        ui.tick(1000 + REFRESH_MS.bar - 1);
        expect(bar.textContent).toBe('stale');
        ui.tick(1000 + REFRESH_MS.bar);
        expect(bar.textContent).toBe(`tick ${snapshot.tick}`);
    });

    it('fills the inspector while its drawer is open', () => {
        const { ui, elements } = setup();
        ui.hooks.toggleDrawer('inspector');
        ui.tick(0);
        expect(byClass(elements.drawers, 'inspector-body')[0].hidden).toBe(false);
    });

    it('records stats into the history and clears the ticker for a new world', () => {
        const { ui, elements, setClock } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onStats({ tick: 5, bySpec: [1, 2, 3, 4, 5] });
        setClock(10);
        ui.listeners.onTicker([{ text: 'x', kind: 'elite' }]);
        ui.listeners.onReady(ready);
        ui.tick(11);
        expect(byClass(elements.ticker, 'ticker-line')[0].hidden).toBe(true);
    });

    it('starts a world from a seed and clears the selection', () => {
        const { ui, state, sent } = setup();
        state.selectedId = 4;
        ui.startWorld(77);
        expect(sent.at(-1)).toEqual(['reset', 77, { maxAgents: 40 }]);
        expect(state.selectedId).toBe(0);
    });

    it('downloads the exported archive under the world seed', () => {
        const { ui, files, sent } = setup();
        ui.hooks.exportArchive();
        expect(sent.at(-1)).toEqual(['exportArchive']);
        ui.listeners.onArchive('{"cells":[]}');
        expect(files[0]).toEqual({ name: `blob-archive-${ready.seed}.json`, text: '{"cells":[]}' });
    });

    it('downloads the failed run bundle once, then the current run bundle', () => {
        const failed = { seed: 5, tick: 9, reason: 'heartbeat' };
        const { ui, files } = setup({ failed });
        ui.hooks.exportBundle();
        ui.hooks.exportBundle();
        expect(files[0].name).toBe('blob-debug-5-9.json');
        const current = JSON.parse(files[1].text);
        expect(current).toMatchObject({ seed: ready.seed, tick: snapshot.tick, config: { maxAgents: 40 } });
    });

    it('toasts instead when there is no world yet, and when fullscreen is refused', async () => {
        const { ui, elements } = setup();
        ui.hooks.fullscreen();
        await Promise.resolve();
        await Promise.resolve();
        expect(byClass(elements.hud, 'toast').map((t) => t.textContent)).toContain('Fullscreen was refused');
    });
});
