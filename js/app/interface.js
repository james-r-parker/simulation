// The page's interface: the top bar, the ticker, the controls, the drawers (charts, inspector, help), toasts, the HUD
// switch, the exports and the preferences, wired to the worker client. A shell over injected parts: `tick(nowMs)` is
// called every animation frame and refreshes each part at its own rate; the logic is in the `ui/` modules and the
// `interface-*.js` helpers.

import { createChartData } from './interface-data.js';
import { createChartsLifecycle } from './interface-charts.js';
import { createFailedBundleTaker, exportBundle } from './interface-exports.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { mountControls } from './ui/controls.js';
import { mountDrawers } from './ui/drawer.js';
import { mountHelp } from './ui/help.js';
import { mountInspector } from './ui/inspector.js';
import { inspectorView, NO_INSPECTION } from './ui/inspector-data.js';
import { wantsRays } from './ui/lenses.js';
import { createTickerQueue, mountTicker } from './ui/ticker.js';
import { createToaster } from './ui/toast.js';
import { mountTopBar, topBarInput, topBarView } from './ui/top-bar.js';

/** How often each part refreshes, in ms. */
export const REFRESH_MS = Object.freeze({ bar: 250, ticker: 100, inspector: 33, charts: 1000 });

/**
 * @typedef {object} InterfaceDeps
 * @property {any} doc the document
 * @property {{hud: any, bar: any, ticker: any, drawers: any}} elements the HUD root and its three mount points
 * @property {{getItem: (k: string) => string | null, setItem: (k: string, v: string) => void} | null} storage where
 *   preferences are kept
 * @property {() => Record<string, any> | null} getClient the current worker client
 * @property {() => Record<string, any> | null} getReady the newest `ready` message
 * @property {import('./actions.js').AppState} state the shared state
 * @property {Record<string, number>} overrides the config overrides the world was started with
 * @property {(action: string) => void} perform runs an action by name
 * @property {() => Promise<any>} loadUPlot loads the uPlot class (and its stylesheet)
 * @property {(file: {name: string, text: string}) => void} download saves a file
 * @property {(ms: number, run: () => void) => unknown} setTimer a timer, for the toasts
 * @property {() => Record<string, any> | null} getFailedBundle the debug bundle the supervisor kept after a failure
 * @property {() => number} now wall time in ms
 */

/**
 * @param {InterfaceDeps} deps the injected parts
 * @returns {Record<string, any>} the parts every function below shares
 */
function build(deps) {
    const { doc, elements, state } = deps;
    const prefs = loadPrefs(deps.storage);
    prefs.lenses.forEach((on, i) => (state.lenses[i] = on));
    const toaster = createToaster({ doc, setTimer: deps.setTimer, parent: elements.hud });
    const ctx = {
        deps,
        prefs,
        hidden: !prefs.hud,
        toast: (/** @type {string} */ text) => toaster.show(text),
        queue: createTickerQueue(),
        chartData: createChartData(),
        barUpdate: mountTopBar(doc, elements.bar),
        tickerUpdate: mountTicker(doc, elements.ticker),
        last: { bar: -Infinity, ticker: -Infinity, inspector: -Infinity, charts: -Infinity },
        controls: /** @type {any} */ (null),
        drawers: /** @type {any} */ (null),
        inspector: /** @type {any} */ (null),
        charts: /** @type {any} */ (null),
    };
    ctx.controls = mountControls(doc, elements.bar, { perform: deps.perform, onSeed: (seed) => startWorld(ctx, seed) });
    ctx.charts = createChartsLifecycle({
        doc,
        drawers: { state: () => ctx.drawers.state(), body: (name) => ctx.drawers.body(name) },
        loadUPlot: deps.loadUPlot,
        toast: ctx.toast,
        getData: ctx.chartData.data,
    });
    ctx.drawers = mountDrawers(doc, elements.drawers, {
        onOpen: (name) => name === 'charts' && ctx.charts.open(),
        onClose: (name) => name === 'charts' && ctx.charts.close(),
    });
    ctx.inspector = mountInspector(doc, ctx.drawers.body('inspector'));
    mountHelp(doc, ctx.drawers.body('help'));
    elements.hud.classList.toggle('hud-hidden', ctx.hidden);
    return ctx;
}

/**
 * Asks the worker for the ray part when the vision lens or a selection needs it.
 * @param {Record<string, any>} ctx the shared parts
 * @returns {void}
 */
function syncRays({ deps }) {
    deps.getClient()?.setLenses(wantsRays(deps.state.lenses, deps.state.selectedId));
}

/**
 * @param {Record<string, any>} ctx the shared parts
 * @param {number} seed the seed of the new world
 * @returns {void}
 */
function startWorld({ deps }, seed) {
    deps.state.selectedId = 0;
    deps.state.followId = 0;
    deps.getClient()?.reset(seed, deps.overrides);
}

/**
 * @param {Record<string, any>} ctx the shared parts
 * @returns {void}
 */
function persist({ deps, prefs, hidden }) {
    savePrefs(deps.storage, { ...prefs, lenses: [...deps.state.lenses], hud: !hidden });
}

/**
 * @param {Record<string, any>} ctx the shared parts
 * @param {boolean} hidden whether the HUD is hidden
 * @returns {void}
 */
function setHud(ctx, hidden) {
    ctx.hidden = hidden;
    ctx.deps.elements.hud.classList.toggle('hud-hidden', hidden);
}

/**
 * @param {Record<string, any>} ctx the shared parts
 * @returns {import('./actions.js').UiHooks} what the actions call on the page
 */
function createHooks(ctx) {
    const { deps } = ctx;
    const takeFailed = createFailedBundleTaker(deps.getFailedBundle);
    return {
        toggleDrawer: (name) => void ctx.drawers.dispatch({ type: 'toggle', drawer: name }),
        closeDrawer() {
            const wasOpen = ctx.drawers.state() !== null;
            ctx.drawers.dispatch({ type: 'closeAll' });
            return wasOpen;
        },
        toggleHud() {
            setHud(ctx, !ctx.hidden);
            persist(ctx);
        },
        focusSeed() {
            setHud(ctx, false);
            ctx.controls.focusSeed();
        },
        fullscreen() {
            const { doc } = deps;
            const request = doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen();
            request?.catch?.(() => ctx.toast('Fullscreen was refused'));
        },
        exportArchive: () => deps.getClient()?.exportArchive(),
        exportBundle: () => exportBundle({ ...deps, toast: ctx.toast, takeFailed }),
        lensesChanged() {
            persist(ctx);
            syncRays(ctx);
        },
        toast: ctx.toast,
    };
}

/**
 * @param {Record<string, any>} ctx the shared parts
 * @returns {Record<string, Function>} the worker client's listeners the interface needs
 */
function createListeners(ctx) {
    const { deps } = ctx;
    return {
        onReady(/** @type {Record<string, any>} */ ready) {
            ctx.chartData.ready(ready);
            ctx.queue.clear();
            ctx.charts.close();
            if (ctx.drawers.state() === 'charts') {
                ctx.charts.open();
            }
            syncRays(ctx);
        },
        onStats: (/** @type {Record<string, any>} */ stats) => ctx.chartData.stats(stats, deps.now()),
        onTicker: (/** @type {{text: string, kind: string}[]} */ items) => ctx.queue.push(items, deps.now()),
        onArchive: (/** @type {string} */ json) =>
            deps.download({ name: `blob-archive-${deps.getReady()?.seed ?? 0}.json`, text: json }),
    };
}

/** What `tick` refreshes: a part, when it needs it, and how. */
const REFRESHERS = Object.freeze([
    {
        key: 'bar',
        wanted: () => true,
        run(/** @type {Record<string, any>} */ ctx) {
            const client = ctx.deps.getClient();
            const paused = client?.paused ?? false;
            ctx.barUpdate(topBarView(topBarInput(client), ctx.deps.state, paused));
            ctx.controls.update({ paused, seed: ctx.deps.getReady()?.seed ?? null, drawer: ctx.drawers.state() });
        },
    },
    {
        key: 'ticker',
        wanted: () => true,
        run: (/** @type {Record<string, any>} */ ctx, /** @type {number} */ now) =>
            ctx.tickerUpdate(ctx.queue.current(now), now),
    },
    {
        key: 'inspector',
        wanted: (/** @type {Record<string, any>} */ ctx) => ctx.drawers.state() === 'inspector',
        run(/** @type {Record<string, any>} */ ctx) {
            const snapshot = ctx.deps.getClient()?.latest;
            const ready = ctx.deps.getReady();
            ctx.inspector.update(snapshot && ready ? inspectorView({ snapshot, ready }) : NO_INSPECTION);
        },
    },
    {
        key: 'charts',
        wanted: (/** @type {Record<string, any>} */ ctx) => ctx.drawers.state() === 'charts',
        run: (/** @type {Record<string, any>} */ ctx) => ctx.charts.update(),
    },
]);

/**
 * @param {InterfaceDeps} deps the injected parts
 * @returns {{hooks: import('./actions.js').UiHooks, listeners: Record<string, Function>, tick: (nowMs: number) => void,
 *   syncRays: () => void, startWorld: (seed: number) => void, toast: (text: string) => void}} the interface:
 *   `hooks` for the actions, `listeners` (`onReady`, `onStats`, `onTicker`, `onArchive`) for the worker client,
 *   `tick` each animation frame, `syncRays` after the selection or a lens changes, `startWorld` for the seed field
 */
export function createInterface(deps) {
    const ctx = build(deps);
    return {
        hooks: createHooks(ctx),
        listeners: createListeners(ctx),
        syncRays: () => syncRays(ctx),
        startWorld: (seed) => startWorld(ctx, seed),
        toast: ctx.toast,
        tick(nowMs) {
            for (const part of REFRESHERS) {
                if (
                    part.wanted(ctx) &&
                    nowMs - ctx.last[part.key] >= REFRESH_MS[/** @type {keyof typeof REFRESH_MS} */ (part.key)]
                ) {
                    ctx.last[part.key] = nowMs;
                    part.run(ctx, nowMs);
                }
            }
        },
    };
}
