// The interface over fakes, shared by the interface tests: a fake page, storage, client and uPlot, and what the
// interface was asked to do.

import { createFamilySlots } from '../../../js/app/family-slots.js';
import { createAppState } from '../../../js/app/actions.js';
import { createInterface } from '../../../js/app/interface.js';
import { PREFS_KEY } from '../../../js/app/prefs.js';
import { fakeDocument } from './fake-dom.js';
import { selectedWorld } from './inspect-world.js';
import { FakeAudioContext } from '../audio/fake-audio.js';

export const { ready, snapshot } = selectedWorld();

/** A stand-in for uPlot. */
export class FakeUPlot {
    static made = /** @type {FakeUPlot[]} */ ([]);
    static paths = { bars: () => 'bars' };
    /** @param {any} opts */
    constructor(opts) {
        this.opts = opts;
        this.destroyed = false;
        FakeUPlot.made.push(this);
    }
    setData() {}
    destroy() {
        this.destroyed = true;
    }
}

/**
 * @param {{stored?: Record<string, string>, failed?: any, seen?: boolean, speedPinned?: boolean, tv?: boolean, audioOn?: boolean}} [options] stored
 *   preferences, the failed bundle, whether the title card was seen, whether `?speed=` pinned the speed, `?tv=1` and `?audio=1`
 * @returns {any} an interface over fakes, with everything it was asked to do
 */
export function setup({
    stored = {},
    failed = null,
    seen = true,
    speedPinned = false,
    tv = false,
    audioOn = false,
} = {}) {
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
    const wakeLocks = /** @type {boolean[]} */ ([]);
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
        tv,
        audioOn,
        AudioContext: FakeAudioContext,
        getCamera: () => ({ x: 500, y: 500, zoom: 1, canvas: { width: 1000, height: 1000 } }),
        setWakeLock: (on) => wakeLocks.push(on),
    });
    const setClock = (/** @type {number} */ t) => (clock = t);
    return { ui, pick, client, slots, width, elements, state, store, sent, files, timers, wakeLocks, doc, setClock };
}
