// The page entry: wires the supervised worker, the renderer, the top bar, the keys and the pointer, and runs the
// animation loop. A browser shell: everything with logic is in the modules it imports, and test/browser/app.spec.js
// covers it.

import { createActions, createAppState, DEFAULT_TICKS_PER_SECOND } from './actions.js';
import { appLog } from './app-log.js';
import { createLayerBuilder, createLayerRefs } from './app-layers.js';
import { createCameraController, resizeCamera } from './camera.js';
import { clipSupported } from './capture.js';
import { buildDebugBundle } from './debug-bundle.js';
import { createFamilySlots } from './family-slots.js';
import { createFrameLoop } from './frame-loop.js';
import { clearFrameStats, createFrameStats } from './frame-stats.js';
import { minPxTable } from './display-size.js';
import { agentAt } from './hover-pick.js';
import { largestOfLineage } from './picking.js';
import { createGpuTimer } from './gpu-timer.js';
import { createInterface } from './interface.js';
import { installPerf } from './perf.js';
import { createPointerInput } from './pointer-input.js';
import { canvasPixelSize } from './renderer/canvas-size.js';
import { createScene } from './renderer/scene.js';
import { chooseSeed } from './seed.js';
import { createSupervisor } from './supervisor.js';
import { createDownloader } from './ui/download.js';
import { actionForKey } from './ui/keymap.js';
import { unsupportedReason } from './support.js';
import { configOverrides, readParams } from './url-params.js';
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
 * Wires the keys and the pointer.
 * @param {{canvas: HTMLCanvasElement, perform: (action: string) => void, input: ReturnType<typeof createPointerInput>,
 *   iface: ReturnType<typeof createInterface>, toDevice: (e: MouseEvent) => {x: number, y: number}}} wiring the canvas,
 *   the action runner, the pointer handlers, the interface that hears every input and the client-to-device mapper
 * @returns {void}
 */
function listen({ canvas, perform, input, iface, toDevice }) {
    window.addEventListener('keydown', (e) => {
        iface.noteInput({ type: 'keydown' });
        const action = actionForKey(e, { clip: clipSupported(globalThis.MediaRecorder) });
        if (action !== null) {
            e.preventDefault();
            perform(action);
        }
    });
    canvas.addEventListener('pointerdown', (e) => {
        iface.noteInput({ type: 'pointerdown' });
        input.down(toDevice(e).x, toDevice(e).y);
    });
    window.addEventListener('pointermove', (e) => {
        iface.noteInput({ type: 'pointermove', x: e.clientX, y: e.clientY });
        iface.pointer(e.clientX, e.clientY);
        input.move(toDevice(e).x, toDevice(e).y);
    });
    window.addEventListener('pointerup', (e) => input.up(toDevice(e).x, toDevice(e).y));
    canvas.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            iface.noteInput({ type: 'wheel' });
            input.wheel(e.deltaY, toDevice(e).x, toDevice(e).y);
        },
        { passive: false },
    );
}

/**
 * @param {HTMLElement} container the canvas parent
 * @param {(size: {width: number, height: number}) => void} onSize called with the canvas size in device pixels
 * @returns {void}
 */
function observeSize(container, onSize) {
    const observer = new ResizeObserver((entries) => onSize(canvasPixelSize(entries[0], container, devicePixelRatio)));
    try {
        observer.observe(container, { box: 'device-pixel-content-box' });
    } catch {
        observer.observe(container);
    }
}

/**
 * Everything the page holds, built once by `createApp`.
 * @typedef {object} App
 * @property {HTMLElement} container the canvas parent
 * @property {import('./url-params.js').Params} params the URL parameters
 * @property {Record<string, number>} overrides the config overrides they imply
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
 * @property {(action: string) => void} perform runs a shortcut action
 * @property {ReturnType<typeof createInterface>} iface the top bar, ticker, drawers and controls
 */

/**
 * @param {App} app the page
 * @returns {void}
 */
function attachGpuTimer(app) {
    const gl = app.deps.scene?.renderer.getContext();
    app.deps.gpuTimer = gl === undefined ? null : createGpuTimer(gl);
}

/**
 * A world is ready: build the scene on the first one, rebuild its layers on later ones, and restart the loop.
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
        app.deps.scene = createScene({
            container: app.container,
            info: message.info,
            quality: app.params.quality,
            scale: app.params.scale,
            buildLayers: createLayerBuilder({
                refs: app.deps.refs,
                getReady: () => app.ready,
                slots: app.slots,
                sink: (effect) => app.iface.onEffect(effect),
            }),
            onRestored: () => attachGpuTimer(app),
        });
        app.deps.scene.resize(app.size.width, app.size.height);
        listen({
            canvas: app.deps.scene.canvas,
            perform: app.perform,
            input: createPointerInput(pointerOptions(app)),
            iface: app.iface,
            toDevice: (e) => clientToDevice(app, { x: e.clientX, y: e.clientY }),
        });
    } else {
        app.deps.scene.rebuild();
    }
    attachGpuTimer(app);
    app.loop.reset(message.info.maxAgents);
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
        getAgents: app.loop.agents,
        getMinPx: () => app.minPx,
        onPick(id) {
            app.state.selectedId = id;
            app.supervisor.client()?.select(id);
            app.iface.syncRays();
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
        listeners: {
            ...app.iface.listeners,
            onReady(message) {
                onReady(app, message);
                app.iface.listeners.onReady(message);
            },
            onSelection(message) {
                if (message.state === 'gone') {
                    state.selectedId = 0;
                    state.followId = 0;
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
        log: (level, event, fields) => appLog(level, event, fields),
    });
}

/**
 * @param {App} app the page
 * @param {{x: number, y: number}} client a point in client pixels
 * @returns {{x: number, y: number}} the same point in device pixels on the canvas
 */
function clientToDevice(app, client) {
    const canvas = app.deps.scene?.canvas;
    const r = canvas?.getBoundingClientRect();
    if (canvas === undefined || r === undefined) {
        return { x: -1, y: -1 };
    }
    return {
        x: ((client.x - r.left) * app.size.width) / r.width,
        y: ((client.y - r.top) * app.size.height) / r.height,
    };
}

/**
 * @returns {Promise<any>} the uPlot class, with its stylesheet; loaded when the charts drawer first opens
 */
async function loadUPlot() {
    const [module] = await Promise.all([import('uplot'), import('uplot/dist/uPlot.min.css')]);
    return module.default;
}

/**
 * @returns {Storage | null} `localStorage`, or null where reading it throws (blocked site data)
 */
function safeStorage() {
    try {
        return localStorage;
    } catch {
        return null;
    }
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
        tv: app.params.tv,
        audioOn: app.params.audio,
        AudioContext: /** @type {any} */ (globalThis).AudioContext ?? null,
        getCamera: () => app.camera,
        setWakeLock: (on) => wakeLock.setEnabled(on),
    });
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
    app.slots = createFamilySlots();
    app.deps = {
        getClient: () => app.supervisor.client(),
        scene: null,
        camera,
        state,
        refs: createLayerRefs(),
        slots: app.slots,
        stats,
        gpuTimer: null,
        clock: () => performance.now(),
        hidden: () => document.hidden,
        afterDraw: (/** @type {{tick: number}} */ frame) => app.iface.afterDraw(frame),
    };
    app.loop = createFrameLoop(app.deps);
    app.iface = makeInterface(app);
    app.supervisor = makeSupervisor(app);
    app.perform = createActions({
        getClient: () => app.supervisor.client(),
        camera,
        state,
        now: () => performance.now(),
        chooseSeed: () => chooseSeed(null),
        config: overrides,
        leaderAgent: () =>
            largestOfLineage(app.loop.agents(), app.supervisor.client()?.stats?.lineages?.top?.[0]?.id ?? -1),
        ui: app.iface.hooks,
    });
    return app;
}

/**
 * @param {any} info `renderer.info`, undefined before the scene exists
 * @returns {{geometries: number, textures: number, programs: number}} the counts `__perf` reports
 */
function gpuCounts(info) {
    const m = info?.memory;
    return { geometries: m?.geometries ?? 0, textures: m?.textures ?? 0, programs: info?.programs?.length ?? 0 };
}

/**
 * @param {App} app the page
 * @returns {import('./perf.js').PerfInputs} the live values `__perf` reports
 */
function readPerf(app) {
    const info = app.deps.scene?.renderer.info;
    return {
        stats: app.stats,
        worker: app.supervisor.client()?.stats ?? null,
        gpu: gpuCounts(info),
        gpuSamples: app.deps.gpuTimer?.samples() ?? null,
        heapBytes: /** @type {any} */ (performance).memory?.usedJSHeapSize ?? null,
    };
}

/**
 * Exposes `window.__perf` in dev builds.
 * @param {App} app the page
 * @returns {void}
 */
function startReporting(app) {
    if (typeof __PRODUCTION__ === 'undefined' || !__PRODUCTION__) {
        installPerf(/** @type {any} */ (window), {
            read: () => readPerf(app),
            reset() {
                clearFrameStats(app.stats, PERF_FRAMES);
                app.deps.gpuTimer?.reset();
            },
        });
    }
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
    const app = createApp(container);
    observeSize(container, (next) => {
        Object.assign(app.size, next);
        app.deps.scene?.resize(next.width, next.height);
        app.iface.resize();
        resizeCamera(app.camera, next);
    });
    startReporting(app);
    const tick = (/** @type {number} */ now) => (app.loop.frame(now), app.iface.tick(now), requestAnimationFrame(tick));
    requestAnimationFrame(tick);
    app.supervisor.start(chooseSeed(app.params.seed));
}

start();
