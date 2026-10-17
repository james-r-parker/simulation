// The page entry: wires the supervised worker, the renderer, the top bar, the keys and the pointer, and runs the
// animation loop. A browser shell: everything with logic is in the modules it imports, and test/browser/app.spec.js
// covers it.

import { createActions, createAppState, DEFAULT_TICKS_PER_SECOND } from './actions.js';
import { appLog } from './app-log.js';
import { createLayerBuilder, createLayerRefs } from './app-layers.js';
import { createCameraController, resizeCamera } from './camera.js';
import { createFrameLoop } from './frame-loop.js';
import { clearFrameStats, createFrameStats } from './frame-stats.js';
import { createGpuTimer } from './gpu-timer.js';
import { installPerf } from './perf.js';
import { createPointerInput } from './pointer-input.js';
import { canvasPixelSize } from './renderer/canvas-size.js';
import { createScene } from './renderer/scene.js';
import { chooseSeed } from './seed.js';
import { createSupervisor } from './supervisor.js';
import { actionForKey } from './ui/keymap.js';
import { mountTopBar, topBarInput, topBarView } from './ui/top-bar.js';
import { unsupportedReason } from './support.js';
import { configOverrides, readParams } from './url-params.js';

const TOP_BAR_MS = 250;
const NOTICE_MS = 8000;
const PERF_FRAMES = 32768;

/**
 * @param {HTMLElement} container where the message goes
 * @param {string} text the message
 * @returns {void}
 */
function showMessage(container, text) {
    const p = document.createElement('p');
    p.className = 'app-message';
    p.textContent = text;
    container.appendChild(p);
}

/**
 * Wires the keys and the pointer.
 * @param {{canvas: HTMLCanvasElement, perform: (action: string) => void, input: ReturnType<typeof createPointerInput>}} wiring
 *   the canvas, the action runner and the pointer handlers
 * @returns {void}
 */
function listen({ canvas, perform, input }) {
    const toDevice = (/** @type {MouseEvent} */ e) => {
        const r = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - r.left) * canvas.width) / r.width,
            y: ((e.clientY - r.top) * canvas.height) / r.height,
        };
    };
    window.addEventListener('keydown', (e) => {
        const action = actionForKey(e);
        if (action !== null) {
            e.preventDefault();
            perform(action);
        }
    });
    canvas.addEventListener('pointerdown', (e) => input.down(toDevice(e).x, toDevice(e).y));
    window.addEventListener('pointermove', (e) => input.move(toDevice(e).x, toDevice(e).y));
    window.addEventListener('pointerup', (e) => input.up(toDevice(e).x, toDevice(e).y));
    canvas.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
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
 * @property {ReturnType<typeof createFrameStats>} stats the frame and draw rings `__perf` reports
 * @property {any} deps the frame loop's dependencies; `scene` and `gpuTimer` are filled once the first world is ready
 * @property {ReturnType<typeof createFrameLoop>} loop the frame loop
 * @property {ReturnType<typeof createSupervisor>} supervisor the supervised worker
 * @property {(action: string) => void} perform runs a shortcut action
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
    const world = { width: message.info.worldWidth, height: message.info.worldHeight };
    Object.assign(app.camera, createCameraController({ canvas: app.size, world }));
    if (app.deps.scene === null) {
        app.deps.scene = createScene({
            container: app.container,
            info: message.info,
            quality: app.params.quality,
            buildLayers: createLayerBuilder({ refs: app.deps.refs, getReady: () => app.ready }),
            onRestored: () => attachGpuTimer(app),
        });
        app.deps.scene.resize(app.size.width, app.size.height);
        listen({ canvas: app.deps.scene.canvas, perform: app.perform, input: createPointerInput(pointerOptions(app)) });
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
        onPick(id) {
            app.state.selectedId = id;
            app.supervisor.client()?.select(id);
            app.supervisor.client()?.setLenses(id !== 0);
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
            onReady: (message) => onReady(app, message),
            onSelection(message) {
                if (message.state === 'gone') {
                    state.selectedId = 0;
                    state.followId = 0;
                }
            },
            onLog: (record) => appLog(record.level ?? 'info', record.event ?? 'WorkerLog', record),
            onError: (message) => appLog('error', 'WorkerError', { message: message.message }),
        },
        onRestart({ seed }) {
            state.notice = `Worker restarted with seed ${seed}`;
            setTimeout(() => (state.notice = ''), NOTICE_MS);
        },
        log: (level, event, fields) => appLog(level, event, fields),
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
    const app = /** @type {any} */ ({ container, params, overrides, state, camera, stats, ready: null });
    app.size = { width: 1, height: 1 };
    app.deps = {
        getClient: () => app.supervisor.client(),
        scene: null,
        camera,
        state,
        refs: createLayerRefs(),
        stats,
        gpuTimer: null,
        clock: () => performance.now(),
        hidden: () => document.hidden,
    };
    app.loop = createFrameLoop(app.deps);
    app.supervisor = makeSupervisor(app);
    app.perform = createActions({
        getClient: () => app.supervisor.client(),
        camera,
        state,
        now: () => performance.now(),
        chooseSeed: () => chooseSeed(null),
        config: overrides,
    });
    return app;
}

/**
 * @param {any} info `renderer.info`, undefined before the scene exists
 * @returns {{geometries: number, textures: number, programs: number}} the counts `__perf` reports
 */
function gpuCounts(info) {
    return {
        geometries: info?.memory.geometries ?? 0,
        textures: info?.memory.textures ?? 0,
        programs: info?.programs?.length ?? 0,
    };
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
 * Exposes `window.__perf` and updates the top bar a few times a second.
 * @param {App} app the page
 * @returns {void}
 */
function startReporting(app) {
    const barUpdate = mountTopBar(document, /** @type {HTMLElement} */ (document.getElementById('top-bar')));
    setInterval(() => {
        const client = app.supervisor.client();
        barUpdate(topBarView(topBarInput(/** @type {any} */ (client)), app.state, client?.paused ?? false));
    }, TOP_BAR_MS);
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
        showMessage(container, reason);
        return;
    }
    const app = createApp(container);
    observeSize(container, (next) => {
        Object.assign(app.size, next);
        app.deps.scene?.resize(next.width, next.height);
        resizeCamera(app.camera, next);
    });
    startReporting(app);
    const tick = (/** @type {number} */ now) => {
        app.loop.frame(now);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    app.supervisor.start(chooseSeed(app.params.seed));
}

start();
