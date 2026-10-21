// The page's interface: the top bar, the ticker, the controls, the drawers (charts, inspector, help), toasts, the HUD
// switch, the exports and the preferences, wired to the worker client. A shell over injected parts: `tick(nowMs)` is
// called every animation frame and refreshes each part at its own rate; the logic is in the `ui/` modules and the
// `interface-*.js` helpers.

import { createChartData } from './interface-data.js';
import { createChartsLifecycle } from './interface-charts.js';
import { createFailedBundleTaker, exportBundle } from './interface-exports.js';
import { assignSlots } from './family-slots.js';
import { createIdleTracker } from './idle.js';
import { refreshParts, REFRESH_MS } from './interface-refresh.js';
import { dismissCard, firstVisit } from './interface-visit.js';

export { REFRESH_MS };
import { loadPrefs, savePrefs } from './prefs.js';
import { familyCss } from './ui/css-color.js';
import { uiScaleFor } from './ui/ui-scale.js';
import { mountControls } from './ui/controls.js';
import { mountDrawers } from './ui/drawer.js';
import { createPeekTracker, mountPeek } from './ui/hover-peek.js';
import { createHudFade } from './ui/hud-fade.js';
import { mountHelp } from './ui/help.js';
import { mountInspector } from './ui/inspector.js';
import { wantsRays } from './ui/lenses.js';
import { createTickerQueue, mountTicker } from './ui/ticker.js';
import { mountTitleCard } from './ui/title-card.js';
import { createToaster } from './ui/toast.js';
import { mountTopBar } from './ui/top-bar.js';

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
 * @property {import('./family-slots.js').FamilySlots} slots the family colour slots; the palette preference sets its palette
 * @property {(device: {x: number, y: number}) => {agents: any, index: number} | null} pickAt the agent under a point in
 *   device pixels (see `hover-pick.js`)
 * @property {(client: {x: number, y: number}) => {x: number, y: number}} toDevice a point in client pixels as device
 *   pixels on the canvas
 * @property {boolean} speedPinned whether `?speed=` fixed the speed, so a first visit does not start at x2
 * @property {() => number} getWidth the canvas width in CSS px, for the automatic HUD size
 */

/**
 * Mounts the controls, the drawers and what goes in them, and applies the HUD state and size.
 * @param {Record<string, any>} ctx the shared parts, whose mount fields this fills
 * @returns {void}
 */
function mountParts(ctx) {
    const { deps, prefs } = ctx;
    const { doc, elements } = deps;
    ctx.controls = mountControls(doc, elements.bar, { perform: deps.perform, onSeed: (seed) => startWorld(ctx, seed) });
    ctx.charts = createChartsLifecycle({
        doc,
        drawers: { state: () => ctx.drawers.state(), body: (name) => ctx.drawers.body(name) },
        loadUPlot: deps.loadUPlot,
        toast: ctx.toast,
        getData: ctx.chartData.data,
        colorOf: (/** @type {number} */ id) => familyCss(deps.slots, id),
    });
    ctx.drawers = mountDrawers(doc, elements.drawers, {
        onOpen: (name) => name === 'charts' && ctx.charts.open(),
        onClose: (name) => name === 'charts' && ctx.charts.close(),
    });
    ctx.inspector = mountInspector(doc, ctx.drawers.body('inspector'));
    ctx.help = mountHelp(doc, ctx.drawers.body('help'), {
        current: prefs.uiScale,
        palette: prefs.palette,
        onPalette(/** @type {string} */ name) {
            prefs.palette = name;
            deps.slots.palette = name;
            deps.slots.version += 1;
            ctx.help.setPalette(name);
            persist(ctx);
        },
        onScale(/** @type {string | number} */ value) {
            prefs.uiScale = value;
            applyScale(ctx);
            persist(ctx);
        },
    });
    ctx.card = mountTitleCard(doc, elements.hud);
    ctx.peek = mountPeek(doc, elements.hud);
    applyScale(ctx);
    elements.hud.classList.toggle('hud-hidden', ctx.hidden);
}

/**
 * @param {InterfaceDeps} deps the injected parts
 * @returns {Record<string, any>} the parts every function below shares
 */
function build(deps) {
    const { doc, elements, state } = deps;
    const prefs = loadPrefs(deps.storage);
    prefs.lenses.forEach((on, i) => (state.lenses[i] = on));
    deps.slots.palette = prefs.palette;
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
        last: {
            bar: -Infinity,
            ticker: -Infinity,
            inspector: -Infinity,
            charts: -Infinity,
            idle: -Infinity,
            shift: -Infinity,
            card: -Infinity,
            peek: -Infinity,
        },
        idle: createIdleTracker(deps.now),
        shifted: { x: 0, y: 0 },
        fade: createHudFade({
            apply(/** @type {boolean} */ idle) {
                elements.hud.classList.toggle('hud-idle', idle);
                doc.documentElement.classList.toggle('cursor-hidden', idle);
            },
        }),
        controls: /** @type {any} */ (null),
        drawers: /** @type {any} */ (null),
        inspector: /** @type {any} */ (null),
        charts: /** @type {any} */ (null),
        help: /** @type {any} */ (null),
        card: /** @type {any} */ (null),
        peek: /** @type {any} */ (null),
        peekTracker: createPeekTracker(),
        shownCard: false,
        persist: () => persist(ctx),
    };
    mountParts(ctx);
    return ctx;
}

/**
 * Sets the root font size from the `uiScale` preference and the canvas width, and marks the size in force.
 * @param {Record<string, any>} ctx the shared parts
 * @returns {void}
 */
function applyScale({ deps, prefs, help }) {
    deps.doc.documentElement.style.fontSize = `${uiScaleFor(deps.getWidth(), prefs.uiScale)}px`;
    help?.setScale(prefs.uiScale);
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
            firstVisit(ctx, ready);
            syncRays(ctx);
        },
        onStats(/** @type {Record<string, any>} */ stats) {
            assignSlots(deps.slots, stats.lineages?.top ?? []);
            ctx.chartData.stats(stats, deps.now());
        },
        onTicker: (/** @type {{text: string, kind: string}[]} */ items) => ctx.queue.push(items, deps.now()),
        onArchive: (/** @type {string} */ json) =>
            deps.download({ name: `blob-archive-${deps.getReady()?.seed ?? 0}.json`, text: json }),
    };
}

/**
 * @param {InterfaceDeps} deps the injected parts
 * @returns {{hooks: import('./actions.js').UiHooks, listeners: Record<string, Function>, tick: (nowMs: number) => void,
 *   syncRays: () => void, startWorld: (seed: number) => void, toast: (text: string) => void,
 *   resize: () => void, pointer: (x: number, y: number) => void, noteInput: (event: import('./idle.js').InputEvent) => boolean}} the interface:
 *   `hooks` for the actions, `listeners` (`onReady`, `onStats`, `onTicker`, `onArchive`) for the worker client,
 *   `tick` each animation frame, `syncRays` after the selection or a lens changes, `startWorld` for the seed field, `resize` when the canvas width changes, `pointer` for each pointer move in client pixels, `noteInput` for each
 *   key, press, wheel and counted pointer move
 */
export function createInterface(deps) {
    const ctx = build(deps);
    return {
        hooks: createHooks(ctx),
        listeners: createListeners(ctx),
        syncRays: () => syncRays(ctx),
        startWorld: (seed) => startWorld(ctx, seed),
        toast: ctx.toast,
        pointer(x, y) {
            ctx.peekTracker.move(x, y, deps.now());
            ctx.peek.hide();
        },
        noteInput(event) {
            const counted = ctx.idle.input(event);
            if (counted) {
                dismissCard(ctx);
            }
            return counted;
        },
        resize: () => applyScale(ctx),
        tick(nowMs) {
            refreshParts(ctx, nowMs);
        },
    };
}
