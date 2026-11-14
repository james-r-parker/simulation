// The GPU stage: three's WebGPURenderer (WebGL2 fallback) with MSAA on a black canvas, one orthographic camera, the
// layers back to front, resize in device pixels, device-loss recovery and the per-frame `draw`. A browser shell:
// everything with logic in it lives in modules that test without a GPU.

import {
    ColorManagement,
    LinearSRGBColorSpace,
    NoToneMapping,
    OrthographicCamera,
    Scene,
    WebGPURenderer,
} from 'three/webgpu';
import { viewBounds } from '../camera.js';
import { appLog } from '../app-log.js';
import { showRenderFailure } from '../ui/render-failure.js';
import { backendOf, chooseBackend, configureRenderer, lossVerdict, stageOptions } from './stage-options.js';

/**
 * A layer. `object` goes into the scene (back to front by its place in the list).
 * @typedef {object} Layer
 * @property {any} object the `Object3D` to draw
 * @property {(frame: Frame) => void} [update] writes this frame's data into the layer's buffers and uniforms
 * @property {(width: number, height: number) => void} [resize] the canvas changed, in device pixels
 * @property {() => void} dispose frees the layer's GPU resources
 */

/**
 * What a layer reads each frame. The caller owns one object and rewrites it; nothing here is allocated per frame.
 * @typedef {object} Frame
 * @property {number} alpha blend factor between the two held snapshots
 * @property {number} tick the playhead's tick (`simTickAt`)
 * @property {number} nowMs wall time
 * @property {number} dtMs the frame time
 * @property {import('../interpolate.js').Interpolated} agents the blended agents
 * @property {{tick: number, u32: Uint32Array, f32: Float32Array} | null} snapshot the newest snapshot
 * @property {{tick: number, u32: Uint32Array, f32: Float32Array} | null} prevSnapshot the older held snapshot
 * @property {import('../camera.js').CameraController} camera the view
 * @property {{temperature: boolean, scent: boolean, territory: boolean, vision: boolean, calls: boolean}} lenses
 * @property {number} selectedId the selected agent's genome id, 0 for none
 * @property {number} followId the followed agent's genome id, 0 for none
 * @property {number} leadLineageId the leading lineage's id, 0 for none
 * @property {number} season the current season index (0: spring, 1: summer, 2: autumn, 3: winter)
 * @property {number} seasonProgress the progress through the season [0, 1]
 * @property {import('../family-slots.js').FamilySlots} family the family colour slots and the palette
 * @property {number} width the canvas width in device pixels
 * @property {number} height the canvas height in device pixels
 */

/**
 * @typedef {object} SceneContext
 * @property {any} renderer the renderer
 * @property {Record<string, any>} info `ready.info`
 * @property {{width: number, height: number}} size the canvas in device pixels
 */

/**
 * @typedef {object} Stage
 * @property {HTMLCanvasElement} canvas the canvas
 * @property {any} renderer the renderer
 * @property {'webgpu' | 'webgl2'} backend the backend it runs on
 * @property {(width: number, height: number) => void} resize sets the canvas size in device pixels
 * @property {(frame: Frame) => boolean} draw draws a frame; false while the device is lost
 * @property {() => void} rebuild frees every layer and builds them again
 * @property {() => boolean} isLost whether the device is lost
 * @property {() => void} dispose frees everything and removes the canvas
 */

const BOUNDS = { left: 0, right: 0, top: 0, bottom: 0 };
const THREE = { ColorManagement, NoToneMapping, LinearSRGBColorSpace };

/**
 * @param {{backend?: string | null, gputime?: boolean}} params the URL parameters
 * @param {{Renderer?: any, gpu?: any}} [deps] the renderer class and `navigator.gpu` (the real ones by default)
 * @returns {Promise<any>} an initialised, configured renderer on the backend `chooseBackend` picks
 */
export async function startRenderer(
    params,
    { Renderer = WebGPURenderer, gpu = /** @type {any} */ (globalThis.navigator)?.gpu } = {},
) {
    const adapter =
        gpu === undefined || gpu === null ? null : await gpu.requestAdapter({ powerPreference: 'high-performance' });
    const info = adapter === null ? null : (adapter.info ?? {});
    const backend = chooseBackend(params.backend, info);
    const renderer = new Renderer(stageOptions({ backend, gputime: params.gputime }));
    await renderer.init();
    configureRenderer(renderer, THREE);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;background:#000';
    return renderer;
}

/**
 * @param {Layer[]} layers the layers
 * @param {(layer: Layer) => void} each what to call on each
 * @returns {void}
 */
function eachLayer(layers, each) {
    for (let i = 0; i < layers.length; i++) {
        each(layers[i]);
    }
}

/**
 * @typedef {object} Rig
 * @property {any} renderer
 * @property {any} camera
 * @property {any} scene
 * @property {Layer[]} layers
 * @property {{width: number, height: number}} size
 * @property {boolean} lost
 * @property {(context: SceneContext) => Layer[]} buildLayers
 * @property {Record<string, any>} info
 */

/** @param {Rig} rig the rig @returns {void} */
function buildInto(rig) {
    rig.scene = new Scene();
    rig.layers = rig.buildLayers({ renderer: rig.renderer, info: rig.info, size: rig.size });
    rig.layers.forEach((layer, index) => {
        layer.object.renderOrder = index;
        layer.object.frustumCulled = false;
        rig.scene.add(layer.object);
    });
    eachLayer(rig.layers, (l) => l.resize?.(rig.size.width, rig.size.height));
}

/** @param {Rig} rig the rig @returns {void} */
function disposeLayers(rig) {
    eachLayer(rig.layers, (l) => l.dispose());
    rig.layers = [];
}

/** The rig and frame being drawn, read by `updateLayer` so `draw` allocates no closures. */
const DRAWING = { frame: /** @type {Frame | null} */ (null) };

/** @param {Layer} layer the layer @returns {void} */
function updateLayer(layer) {
    layer.update?.(/** @type {Frame} */ (DRAWING.frame));
}

/**
 * @param {Rig} rig the rig
 * @param {Frame} frame the frame
 * @returns {boolean} false when the device is lost and nothing was drawn
 */
function drawRig(rig, frame) {
    if (rig.lost) {
        return false;
    }
    Object.assign(rig.camera, viewBounds(frame.camera, BOUNDS));
    rig.camera.updateProjectionMatrix();
    frame.width = rig.size.width;
    frame.height = rig.size.height;
    DRAWING.frame = frame;
    eachLayer(rig.layers, updateLayer);
    DRAWING.frame = null;
    rig.renderer.render(rig.scene, rig.camera);
    return true;
}

/**
 * @param {Rig} rig the rig
 * @returns {Stage} the stage's surface over the rig
 */
function stageOver(rig) {
    return {
        canvas: rig.renderer.domElement,
        renderer: rig.renderer,
        backend: backendOf(rig.renderer),
        resize(width, height) {
            rig.size.width = width;
            rig.size.height = height;
            rig.renderer.setSize(width, height, false);
            eachLayer(rig.layers, (l) => l.resize?.(width, height));
        },
        draw: (frame) => drawRig(rig, frame),
        rebuild() {
            disposeLayers(rig);
            buildInto(rig);
        },
        isLost: () => rig.lost,
        dispose() {
            disposeLayers(rig);
            rig.renderer.dispose();
            rig.renderer.domElement.remove();
        },
    };
}

/**
 * @typedef {object} LossContext
 * @property {Rig} rig the rig
 * @property {Stage} stage the stage
 * @property {HTMLElement} container the canvas container
 * @property {(params: any) => Promise<any>} start makes a renderer
 * @property {Record<string, any>} params the URL parameters
 * @property {() => number} now the clock
 * @property {((stage: Stage) => void) | undefined} onRestored hears of a rebuilt stage
 */

/**
 * Replaces a lost renderer with a new one and builds every layer again.
 * @param {LossContext} ctx the context
 * @param {(info: any) => void} onLost the loss handler the new renderer gets
 * @returns {Promise<void>} settles once the stage draws again
 */
async function restart(ctx, onLost) {
    const { rig, stage, container } = ctx;
    disposeLayers(rig);
    rig.renderer.domElement.remove();
    rig.renderer = await ctx.start(ctx.params);
    container.appendChild(rig.renderer.domElement);
    Object.assign(stage, { renderer: rig.renderer, canvas: rig.renderer.domElement, backend: backendOf(rig.renderer) });
    rig.renderer.onDeviceLost = onLost;
    buildInto(rig);
    stage.resize(rig.size.width, rig.size.height);
    rig.lost = false;
    appLog('info', 'DeviceRestored', { backend: stage.backend });
    ctx.onRestored?.(stage);
}

/**
 * Makes the device-loss handler: rebuild after a first loss, fail after a second inside `LOSS_WINDOW_MS`.
 * @param {LossContext} ctx the context
 * @returns {(info: {message?: string, reason?: string}) => void} the handler
 */
function lossHandler(ctx) {
    const losses = { lastLossMs: -Infinity };
    const fail = (/** @type {number} */ count, /** @type {string} */ message) => {
        appLog('error', 'RendererFailed', { losses: count, message });
        showRenderFailure(ctx.container);
    };
    const onLost = (/** @type {{message?: string, reason?: string}} */ lossInfo) => {
        ctx.rig.lost = true;
        appLog('warn', 'DeviceLost', { reason: lossInfo?.reason ?? null, message: lossInfo?.message ?? '' });
        if (lossVerdict(losses, ctx.now()) === 'fail') {
            fail(2, lossInfo?.message ?? '');
            return;
        }
        restart(ctx, onLost).catch((error) => fail(1, String(error?.message ?? error)));
    };
    return onLost;
}

/**
 * @param {(params: any) => Promise<any>} start makes a renderer
 * @param {Record<string, any>} params the URL parameters
 * @param {HTMLElement} container where the failure message goes
 * @returns {Promise<any>} the renderer
 * @throws {Error} when none starts, after logging `RendererInitFailed` and showing the message
 */
async function firstRenderer(start, params, container) {
    try {
        return await start(params);
    } catch (error) {
        appLog('error', 'RendererInitFailed', { message: String(/** @type {any} */ (error)?.message ?? error) });
        showRenderFailure(container);
        throw error;
    }
}

/**
 * Builds the stage: an initialised renderer, the canvas in `container` and the layers from `buildLayers`.
 * @param {{container: HTMLElement, info: Record<string, any>, buildLayers: (context: SceneContext) => Layer[],
 *   params?: {backend?: string | null, gputime?: boolean}, onRestored?: (stage: Stage) => void,
 *   now?: () => number, start?: (params: any) => Promise<any>}} options `buildLayers` is called again after a device
 *   loss; `onRestored` hears of the rebuilt stage; `now` is the clock the loss rule reads; `start` makes an
 *   initialised renderer (the real one by default, a fake in tests)
 * @returns {Promise<Stage>} the stage
 * @throws {Error} when no renderer can start; the failure message is shown and `RendererInitFailed` logged
 */
export async function createStage(options) {
    const { container, info, buildLayers, params = {}, onRestored } = options;
    const start = options.start ?? ((/** @type {any} */ p) => startRenderer(p));
    const renderer = await firstRenderer(start, params, container);
    /** @type {Rig} */
    const rig = {
        renderer,
        camera: new OrthographicCamera(-1, 1, 1, -1, -1, 1),
        scene: null,
        layers: [],
        size: { width: 1, height: 1 },
        lost: false,
        buildLayers,
        info,
    };
    container.appendChild(renderer.domElement);
    buildInto(rig);
    const stage = stageOver(rig);
    const now = options.now ?? (() => performance.now());
    renderer.onDeviceLost = lossHandler({ rig, stage, container, start, params, now, onRestored });
    appLog('info', 'RendererReady', {
        backend: stage.backend,
        forced: params.backend ?? null,
        samples: renderer.samples,
        pixelRatio: globalThis.devicePixelRatio ?? 1,
    });
    return stage;
}
