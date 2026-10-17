import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../js/app/interpolate.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
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
 * @param {{stored?: Record<string, string>, failed?: any, seen?: boolean, speedPinned?: boolean}} [options] stored
 *   preferences, the failed bundle, whether the title card was seen and whether `?speed=` pinned the speed
 * @returns {any} an interface over fakes, with everything it was asked to do
 */
function setup({ stored = {}, failed = null, seen = true, speedPinned = false } = {}) {
    const doc = fakeDocument();
    doc.body = doc.createElement('body');
    doc.documentElement = {
        requestFullscreen: () => Promise.reject(new Error('no')),
        style: {},
        classList: doc.createElement('html').classList,
    };
    const elements = {
        hud: doc.createElement('div'),
        bar: doc.createElement('div'),
        ticker: doc.createElement('div'),
        drawers: doc.createElement('div'),
    };
    const store = new Map(Object.entries(stored));
    if (!store.has(PREFS_KEY) && seen) {
        store.set(PREFS_KEY, JSON.stringify({ seen: true }));
    }
    const sent = /** @type {any[]} */ ([]);
    const client = {
        paused: false,
        pausedAck: false,
        latest: snapshot,
        setLenses: (/** @type {boolean} */ r) => sent.push(['setLenses', r]),
        reset: (/** @type {number} */ s, /** @type {any} */ c) => sent.push(['reset', s, c]),
        exportArchive: () => sent.push(['exportArchive']),
        setSpeed: (/** @type {number} */ n) => sent.push(['setSpeed', n]),
    };
    const files = /** @type {any[]} */ ([]);
    const timers = /** @type {any[]} */ ([]);
    const state = createAppState();
    const slots = createFamilySlots();
    const pick = { hit: /** @type {any} */ (null) };
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
        slots,
        pickAt: (/** @type {any} */ device) => (pick.hit === null ? null : { ...pick.hit, at: device }),
        toDevice: (/** @type {any} */ point) => point,
        speedPinned,
    });
    return {
        ui,
        pick,
        client,
        slots,
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
        const { ui, width, doc } = setup();
        expect(doc.documentElement.style.fontSize).toBe('32px');
        width.value = 1920;
        ui.resize();
        expect(doc.documentElement.style.fontSize).toBe('16px');
        const stored = setup({ stored: { [PREFS_KEY]: JSON.stringify({ uiScale: 1.5 }) } });
        expect(stored.doc.documentElement.style.fontSize).toBe('24px');
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
        const { ui, elements, client, setClock } = setup();
        setClock(1000);
        ui.listeners.onTicker([{ text: 'lineage 3 takes the lead', kind: 'new-leader' }]);
        ui.tick(1000);
        const [speed] = byClass(elements.bar, 'top-bar-speed');
        expect(speed.textContent).toMatch(/^x1/);
        expect(byClass(elements.ticker, 'ticker-line')[0].textContent).toBe('lineage 3 takes the lead');
        client.pausedAck = true;
        ui.tick(1000 + REFRESH_MS.bar - 1);
        expect(speed.textContent).toMatch(/^x1/);
        ui.tick(1000 + REFRESH_MS.bar);
        expect(speed.textContent).toBe('paused');
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

    it('fades the HUD and hides the cursor after 30 s idle, and brings them back on input', () => {
        const { ui, elements, doc, setClock } = setup();
        ui.tick(100);
        setClock(31000);
        ui.tick(31000);
        expect(elements.hud.classList.contains('hud-idle')).toBe(true);
        expect(doc.documentElement.classList.contains('cursor-hidden')).toBe(true);
        expect(ui.noteInput({ type: 'keydown' })).toBe(true);
        ui.tick(31200);
        expect(elements.hud.classList.contains('hud-idle')).toBe(false);
        expect(doc.documentElement.classList.contains('cursor-hidden')).toBe(false);
    });

    it('shifts the persistent nodes once a second, to whole pixels', () => {
        const { ui, elements } = setup();
        ui.tick(100_000);
        expect(elements.bar.style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\)$/);
        expect(elements.ticker.style.transform).toBe(elements.bar.style.transform);
    });

    it('gives the top families their colour slots on every stats message', () => {
        const { ui, slots } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onStats({
            tick: 5,
            lineages: {
                top: [
                    { id: 4, share: 0.6 },
                    { id: 9, share: 0.3 },
                ],
            },
        });
        expect(Array.from(slots.ids.slice(0, 3))).toEqual([4, 9, -1]);
    });

    it('switches the palette from the help buttons, bumping the slot version and remembering it', () => {
        const { elements, slots, store } = setup();
        const before = slots.version;
        byClass(elements.drawers, 'help-size')[6].dispatch('click');
        expect(slots.palette).toBe('cvd-safe');
        expect(slots.version).toBe(before + 1);
        expect(JSON.parse(store.get(PREFS_KEY) ?? '{}').palette).toBe('cvd-safe');
    });

    it('starts with the stored palette', () => {
        const { slots } = setup({ stored: { [PREFS_KEY]: JSON.stringify({ palette: 'high-contrast' }) } });
        expect(slots.palette).toBe('high-contrast');
    });

    it('shows the title card on a first visit, starts at x2, and dismisses it on input, remembering it', () => {
        const { ui, elements, state, sent, store } = setup({ seen: false });
        ui.listeners.onReady(ready);
        const [card] = byClass(elements.hud, 'title-card');
        expect(card.hidden).toBe(false);
        expect(state.requestedTicksPerSecond).toBe(120);
        expect(sent).toContainEqual(['setSpeed', 120]);
        expect(byClass(card, 'legend-item')).toHaveLength(5);
        expect(ui.noteInput({ type: 'pointermove', x: 1, y: 1 })).toBe(false);
        expect(card.hidden).toBe(false);
        ui.noteInput({ type: 'keydown' });
        expect(card.hidden).toBe(true);
        expect(JSON.parse(store.get(PREFS_KEY) ?? '{}').seen).toBe(true);
    });

    it('dismisses the card after 12 s without input, and keeps the speed a link pinned', () => {
        const { ui, elements, setClock, state, sent } = setup({ seen: false, speedPinned: true });
        setClock(1000);
        ui.listeners.onReady(ready);
        expect(state.requestedTicksPerSecond).toBe(60);
        expect(sent.some((/** @type {any[]} */ m) => m[0] === 'setSpeed')).toBe(false);
        setClock(1000 + 11_000);
        ui.tick(1000 + 11_000);
        const [card] = byClass(elements.hud, 'title-card');
        expect(card.hidden).toBe(false);
        setClock(1000 + 12_000);
        ui.tick(1000 + 12_000);
        expect(card.hidden).toBe(true);
    });

    it('shows no card on a later visit, but still fills the legend at the top of the help drawer', () => {
        const { ui, elements } = setup();
        ui.listeners.onReady(ready);
        expect(byClass(elements.hud, 'title-card')[0].hidden).toBe(true);
        expect(byClass(byClass(elements.drawers, 'help-legend')[0], 'legend-item')).toHaveLength(5);
    });

    it('writes the tick and the run time into the help drawer and the status into the bar', () => {
        const { ui, elements } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onStats({
            tick: 5,
            population: 12,
            season: 0,
            seasonProgress: 0,
            bySpec: [],
            lineages: { top: [] },
        });
        ui.tick(0);
        expect(byClass(elements.drawers, 'help-tick')[0].textContent).toBe(`tick ${snapshot.tick}`);
        expect(byClass(elements.bar, 'top-bar-status')[0].textContent).toMatch(/^Starting a new world$|blobs and/);
    });

    it('shows the hover tag once the pointer rests over an agent, and hides it on a move or an open drawer', () => {
        const { ui, elements, pick, setClock } = setup();
        ui.listeners.onReady(ready);
        const agents = createInterpolated(4);
        interpolateInto(null, snapshot, 1, agents);
        pick.hit = { agents, index: 0 };
        setClock(1000);
        ui.pointer(50, 60);
        ui.tick(1000);
        const [tag] = byClass(elements.hud, 'peek');
        expect(tag.hidden).toBe(true);
        setClock(1200);
        ui.tick(1200);
        expect(tag.hidden).toBe(false);
        expect(byClass(tag, 'peek-text')[0].textContent).toMatch(/^\w+, [A-Z][a-z]+: [a-z ]+$/);
        expect([tag.style.left, tag.style.top]).toEqual(['64px', '74px']);
        ui.pointer(51, 60);
        expect(tag.hidden).toBe(true);
        setClock(1500);
        ui.tick(1500);
        expect(tag.hidden).toBe(false);
        ui.hooks.toggleDrawer('help');
        ui.tick(1600);
        expect(tag.hidden).toBe(true);
    });

    it('hides the tag when nothing is under the pointer', () => {
        const { ui, elements, pick, setClock } = setup();
        ui.listeners.onReady(ready);
        pick.hit = null;
        setClock(1000);
        ui.pointer(5, 5);
        setClock(1300);
        ui.tick(1300);
        expect(byClass(elements.hud, 'peek')[0].hidden).toBe(true);
    });
});
