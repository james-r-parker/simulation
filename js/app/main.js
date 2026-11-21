// The page entry: wires the supervised worker, the renderer, the top bar, the keys and the pointer, and runs the
// animation loop. A browser shell: everything with logic is in the modules it imports, and test/browser/app.spec.js
// covers it.

import { createActions, createAppState, DEFAULT_TICKS_PER_SECOND } from './actions.js';
import { appLog } from './app-log.js';
import { createLayerBuilder, createLayerRefs } from './app-layers.js';
import { createCameraController, resizeCamera } from './camera.js';
import { buildDebugBundle } from './debug-bundle.js';
import { createDriver } from './director/driver.js';
import { createTvMode } from './tv-mode.js';
import { createDirectorFeed } from './director/feed.js';
import { createFamilySlots } from './family-slots.js';
import { createFrameLoop } from './frame-loop.js';
import { bootPack, startPack } from './pack/pack-boot.js';
import { requireIsolation } from './isolation.js';
import { showRenderFailure } from './ui/render-failure.js';
import { clearFrameStats, createFrameStats } from './frame-stats.js';
import { createAppLiveness, readAppPerf, startReporting } from './liveness.js';
import { MIN_CSS_PX_TOUCH, minPxTable } from './display-size.js';
import { clientToDevice, deviceToClient, devicePerCss } from './canvas-geometry.js';
import { agentAt } from './hover-pick.js';
import { gpuTimeFor } from './gpu-time.js';
import { createInterface } from './interface.js';
import { viewDeps } from './insights-follow.js';
import { listen, observeSize } from './page-listen.js';
import { createPointerInput } from './pointer-input.js';
import { createStage } from './renderer/stage.js';
import { chooseSeed } from './seed.js';
import { createSupervisor } from './supervisor.js';
import { createDownloader } from './ui/download.js';
import { safeStorage, unsupportedReason } from './support.js';
import { configOverrides, readParams } from './url-params.js';
import { createFxDev, fxAfterDraw, fxSink, readFxParams } from './fx-dev.js';
import { createWakeLock } from './wake-lock.js';

const PERF_FRAMES = 32768;

/**
 * @param {HTMLElement} container where the message goes
 * @param {string} text the message
 * @returns {void}
 */
function showMessage(container, text) {
    const p = Object.assign(document.createElement('p'), { className: 'app-message', textContent: text });
    container.appendChild(p);
}

/**
 * Everything the page holds, built once by `createApp`.
 * @typedef {object} App
 * @property {HTMLElement} container the canvas parent
 * @property {import('./url-params.js').Params} params the URL parameters
 * @property {Record<string, number | boolean>} overrides the config overrides they imply
 * @property {import('./actions.js').AppState} state the selection, follow and speed
 * @property {import('./camera.js').CameraController} camera the view
 * @property {{width: number, height: number}} size the canvas in device pixels
 * @property {Record<string, any> | null} ready the newest `ready` message
 * @property {import('./family-slots.js').FamilySlots} slots the family colour slots and the palette
 * @property {number[]} minPx the least each specialisation is drawn across, from `ready`
 * @property {ReturnType<typeof createFrameStats>} stats the frame and draw rings `__perf` reports
 * @property {any} deps the frame loop's dependencies; `scene` and `gpuTimer` are filled once the first world is ready
 * @property {ReturnType<typeof createFrameLoop>} loop the frame loop
 * @property {ReturnType<typeof createSupervisor>} supervisor the supervised worker
 * @property {ReturnType<typeof bootPack>} pack the pack worker's client
 * @property {(action: string) => void} perform runs a shortcut action
 * @property {ReturnType<typeof createInterface>} iface the top bar, ticker, drawers and controls
 * @property {ReturnType<typeof createDirectorFeed>} feed the effects and ticker the director reads
 * @property {ReturnType<typeof createDriver>} driver the director on the page
 * @property {ReturnType<typeof createTvMode>} tv TV mode
 * @property {ReturnType<typeof createFxDev>} fxDev the effect developer tools, null unless the URL asks
 * @property {Promise<void> | null} [building] the stage being built for the first world
 */

/** Builds the GPU stage for the first world, hooks the pointer input to it and starts the loop. @param {App} app the page @returns {Promise<void>} settles once it draws, or after the failure is logged and shown */
async function buildStage(app) {
    const ready = /** @type {Record<string, any>} */ (app.ready);
    const stage = await createStage({
        container: app.container,
        info: ready.info,
        params: { backend: app.params.backend, gputime: app.params.gputime },
        buildLayers: createLayerBuilder({
            refs: app.deps.refs,
            getReady: () => app.ready,
            slots: app.slots,
            sink(effect) {
                app.feed.noteEffect(effect);
                fxSink(app, effect);
            },
        }),
        onRestored: () => (app.deps.gpuTimer = gpuTimeFor(app.deps.scene)),
    }).catch(() => null);
    if (stage === null) {
        return;
    }
    app.deps.scene = stage;
    app.deps.scene.resize(app.size.width, app.size.height);
    listen({
        canvas: app.deps.scene.canvas,
        perform: app.perform,
        input: createPointerInput(pointerOptions(app)),
        iface: app.iface,
        toDevice: (e) => clientToDevice(app, { x: e.clientX, y: e.clientY }),
    });
    startWorld(app);
}

/**
 * A world is ready: build the stage on the first one (asynchronously), rebuild its layers on later ones, and restart
 * the loop.
 * @param {App} app the page
 * @param {Record<string, any>} message the `ready` message
 * @returns {void}
 */
function onReady(app, message) {
    app.ready = message;
    app.minPx = minPxTable(message.info);
    const world = { width: message.info.worldWidth, height: message.info.worldHeight };
    Object.assign(app.camera, createCameraController({ canvas: app.size, world }));
    if (app.deps.scene === null) {
        app.building ??= buildStage(app);
        return;
    }
    app.deps.scene.rebuild();
    startWorld(app);
}

/** Restarts the loop on the current world and applies a requested speed. @param {App} app the page @returns {void} */
function startWorld(app) {
    app.deps.gpuTimer = gpuTimeFor(app.deps.scene);
    app.loop.reset();
    startPack(app.pack, { ready: app.ready, client: app.supervisor.client(), refs: app.deps.refs });
    if (app.state.requestedTicksPerSecond !== DEFAULT_TICKS_PER_SECOND) {
        app.supervisor.client()?.setSpeed(app.state.requestedTicksPerSecond);
    }
}

/**
 * @param {App} app the page
 * @returns {import('./pointer-input.js').PointerInputOptions} what the pointer handlers need
 */
function pointerOptions(app) {
    return {
        camera: app.camera,
        onNavigate: () => {
            app.state.followId = 0;
        },
        getAgents: app.loop.agents,
        getMinPx: () => app.minPx,
        getTouchMinPx: () => MIN_CSS_PX_TOUCH * devicePerCss(app),
        onLongPress(_id, x, y) {
            const at = deviceToClient(app, { x, y });
            app.iface.peekAt(at.x, at.y);
        },
        onPick(id) {
            app.state.selectedId = id;
            app.supervisor.client()?.select(id);
            app.iface.syncRays();
            app.iface.openInspectorOnPick();
        },
    };
}

/**
 * @param {App} app the page
 * @returns {ReturnType<typeof createSupervisor>} the supervisor, not yet started
 */
function makeSupervisor(app) {
    const { state } = app;
    return createSupervisor({
        createWorker: () =>
            /** @type {any} */ (new Worker(new URL('../worker/sim-worker.js', import.meta.url), { type: 'module' })),
        chooseSeed: () => chooseSeed(null),
        now: () => performance.now(),
        setTimer: (ms, run) => setTimeout(run, ms),
        clearTimer: (handle) => clearTimeout(/** @type {any} */ (handle)),
        config: app.overrides,
        policy: app.params.policy ?? undefined,
        listeners: {
            ...app.iface.listeners,
            onReady(message) {
                onReady(app, message);
                app.driver.onReady(message);
                app.iface.listeners.onReady(message);
            },
            onSelection(message) {
                if (message.state === 'gone') {
                    state.selectedId = 0;
                }
            },
            onLog: (record) => appLog(record.level ?? 'info', record.event ?? 'WorkerLog', record),
            onError: (message) => appLog('error', 'WorkerError', { message: message.message }),
        },
        onRestart: ({ seed }) =>
            app.iface.toast(`Worker restarted with seed ${seed}. Press B for the failed run's debug bundle.`),
        buildBundle: (info) =>
            app.ready === null
                ? info
                : {
                      ...buildDebugBundle({ ready: app.ready, overrides: app.overrides, tick: info.tick }),
                      reason: info.reason,
                  },
        log: appLog,
    });
}

/**
 * @returns {Promise<any>} the uPlot class, with its stylesheet; loaded when the charts drawer first opens
 */
async function loadUPlot() {
    const [module] = await Promise.all([import('uplot'), import('uplot/dist/uPlot.min.css')]);
    return module.default;
}

/**
 * @param {App} app the page, whose supervisor does not exist yet
 * @returns {ReturnType<typeof createInterface>} the interface over the page's elements
 */
function makeInterface(app) {
    const el = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
    const wakeLock = createWakeLock({
        nav: navigator,
        doc: document,
        onRefused: (reason) => appLog('warn', 'WakeLockRefused', { reason }),
    });
    return createInterface({
        doc: document,
        elements: { hud: el('hud'), bar: el('top-bar'), ticker: el('ticker'), drawers: el('drawers') },
        storage: safeStorage(),
        getClient: () => app.supervisor.client(),
        getReady: () => app.ready,
        state: app.state,
        overrides: app.overrides,
        perform: (action) => app.perform(action),
        loadUPlot,
        download: createDownloader({ doc: document, url: URL }),
        setTimer: (ms, run) => setTimeout(run, ms),
        clearTimer: (handle) => clearTimeout(/** @type {any} */ (handle)),
        MediaRecorder: globalThis.MediaRecorder,
        getCanvas: () => app.deps.scene?.canvas ?? null,
        getFailedBundle: () => app.supervisor.lastBundle(),
        now: () => performance.now(),
        getWidth: () => app.container.clientWidth,
        slots: app.slots,
        pickAt: (device) => agentAt({ agents: app.loop.agents(), camera: app.camera, minPx: app.minPx }, device),
        toDevice: (client) => clientToDevice(app, client),
        speedPinned: app.params.speed !== null,
        onTicker: (items) => app.feed.noteTicker(items),
        onInput: (event) => app.tv.noteInput(event),
        tv: app.params.tv,
        dim: app.params.dim,
        audioOn: app.params.audio,
        AudioContext: /** @type {any} */ (globalThis).AudioContext ?? null,
        ...viewDeps(app),
        setWakeLock: (on) => wakeLock.setEnabled(on),
    });
}

/**
 * @param {App} app the page, whose `slots`, `pack`, `driver` and `stats` exist
 * @returns {any} the frame loop's dependencies; `scene` and `gpuTimer` are filled once the first world is ready
 */
function createLoopDeps(app) {
    return {
        getClient: () => app.supervisor.client(),
        scene: null,
        camera: app.camera,
        state: app.state,
        refs: createLayerRefs(),
        slots: app.slots,
        stats: app.stats,
        gpuTimer: null,
        clock: () => performance.now(),
        hidden: () => document.hidden,
        afterDraw: (/** @type {any} */ frame) => fxAfterDraw(app, frame),
        getPack: () => app.pack.slots(),
        director: app.driver,
        getReady: () => app.ready,
        select(/** @type {number} */ id) {
            app.state.selectedId = id;
            app.supervisor.client()?.select(id);
            app.iface.syncRays();
        },
    };
}

/**
 * @param {HTMLElement} container the canvas parent
 * @returns {App} the page, with the worker not yet started
 */
function createApp(container) {
    const params = readParams(location.search);
    const overrides = configOverrides(params);
    const state = createAppState(params.speed === null ? undefined : params.speed * 60);
    const camera = createCameraController({ canvas: { width: 1, height: 1 }, world: { width: 1, height: 1 } });
    const stats = createFrameStats(PERF_FRAMES);
    /** @type {App} */
    const app = /** @type {any} */ ({ container, params, overrides, state, camera, stats, ready: null, minPx: [] });
    app.size = { width: 1, height: 1 };
    app.fxDev = createFxDev({
        params: readFxParams(location.search),
        doc: document,
        parent: container,
        target: window,
    });
    app.slots = createFamilySlots();
    app.feed = createDirectorFeed();
    app.driver = createDriver({ camera, state, getClient: () => app.supervisor.client(), feed: app.feed });
    app.pack = bootPack(document);
    app.deps = createLoopDeps(app);
    app.loop = createFrameLoop(app.deps);
    app.iface = makeInterface(app);
    app.supervisor = makeSupervisor(app);
    app.tv = createTvMode({ driver: app.driver, state, camera, iface: app.iface });
    app.perform = createActions({
        getClient: () => app.supervisor.client(),
        camera,
        state,
        now: () => performance.now(),
        chooseSeed: () => chooseSeed(null),
        config: overrides,
        lastMoments: () => app.deps.refs.player?.moments ?? null,
        followAgent: app.loop.followAgent,
        ui: app.iface.hooks,
        toggleTv: () => app.tv.toggle(),
    });
    return app;
}

/**
 * @returns {void}
 */
function start() {
    const container = /** @type {HTMLElement} */ (document.getElementById('canvas-container'));
    const reason = unsupportedReason({
        Worker: globalThis.Worker,
        createCanvas: () => document.createElement('canvas'),
    });
    if (reason !== null) {
        return showMessage(container, reason);
    }
    // No isolation, no shared memory, no snapshots: show the card and start no worker (docs/designs/pack-worker.md).
    if (!requireIsolation({ scope: globalThis, container, log: appLog, show: showRenderFailure })) {
        return;
    }
    const app = createApp(container);
    window.__blob = createAppLiveness({
        readFrames: () => app.stats.drawCalls,
        readTick: () => app.supervisor.tick(),
        resetFrames: () => clearFrameStats(app.stats, PERF_FRAMES),
    });
    observeSize(container, (next) => {
        Object.assign(app.size, next);
        app.deps.scene?.resize(next.width, next.height);
        app.iface.resize();
        resizeCamera(app.camera, next);
    });
    startReporting({
        target: /** @type {any} */ (window),
        production: typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__,
        read: () => readAppPerf(app),
        reset: () => {
            clearFrameStats(app.stats, PERF_FRAMES);
            app.deps.gpuTimer?.reset();
        },
    });
    const tick = (/** @type {number} */ now) => {
        app.loop.frame(now);
        app.iface.setCaption(app.driver.caption() || app.loop.followCaption());
        app.tv.tick();
        const era = app.driver.takeEra();
        if (era !== null) {
            app.iface.showEra(era);
        }
        app.iface.tick(now);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (app.params.tv) {
        app.tv.enter('url');
    }
    app.supervisor.start(chooseSeed(app.params.seed));
}

start();
