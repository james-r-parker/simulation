import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { createInterface, shouldOpenInspector } from '../../js/app/interface.js';
import { PREFS_KEY } from '../../js/app/prefs.js';
import { fakeDocument } from './helpers/fake-dom.js';

/**
 * @param {{seen?: boolean}} [options]
 * @returns {any} an interface over fakes
 */
function setup({ seen = true } = {}) {
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
    const store = new Map();
    if (seen) {
        store.set(PREFS_KEY, JSON.stringify({ seen: true }));
    }
    const state = createAppState();
    const ui = createInterface({
        doc,
        elements,
        storage: {
            getItem: (k) => store.get(k) ?? null,
            setItem: (k, v) => store.set(k, v),
        },
        getClient: () => null,
        getReady: () => null,
        state,
        now: () => 1000,
        slots: createFamilySlots(),
        pickAt: () => null,
        toDevice: (p) => p,
        speedPinned: false,
        tv: false,
        audioOn: false,
        AudioContext: null,
        getCamera: () => ({ x: 0, y: 0, zoom: 1, canvas: { width: 100, height: 100 } }),
        setWakeLock: () => {},
        getWidth: () => 1000,
        perform: () => {},
        getFailedBundle: () => null,
        setTimer: () => 0,
        clearTimer: () => {},
        loadUPlot: async () => class {},
    });
    return { ui, state };
}

describe('shouldOpenInspector', () => {
    it('opens on null and on inspector, not on charts or help, not for id 0, not with HUD hidden', () => {
        expect(shouldOpenInspector(null, 1, true)).toBe(true);
        expect(shouldOpenInspector('inspector', 1, true)).toBe(true);

        expect(shouldOpenInspector('charts', 1, true)).toBe(false);
        expect(shouldOpenInspector('help', 1, true)).toBe(false);

        expect(shouldOpenInspector(null, 0, true)).toBe(false);
        expect(shouldOpenInspector('inspector', 0, true)).toBe(false);

        expect(shouldOpenInspector(null, 1, false)).toBe(false);
        expect(shouldOpenInspector('inspector', 1, false)).toBe(false);
    });
});

describe('openInspectorOnPick', () => {
    it('dispatches open inspector when an agent is selected with HUD shown', () => {
        const { ui, state } = setup();
        state.selectedId = 42;
        ui.openInspectorOnPick();
        expect(ui.hooks.closeDrawer()).toBe(true);
    });

    it('does not open when another drawer is open', () => {
        const { ui, state } = setup();
        state.selectedId = 42;
        ui.hooks.toggleDrawer('charts');
        ui.openInspectorOnPick();
        expect(ui.hooks.closeDrawer()).toBe(true);
    });

    it('does not open when HUD is hidden', () => {
        const { ui, state } = setup();
        state.selectedId = 42;
        ui.hooks.toggleHud();
        ui.openInspectorOnPick();
        expect(ui.hooks.closeDrawer()).toBe(false);
    });
});
