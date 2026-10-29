// The WebGL renderer, the orthographic camera, the layers in their order, resize in device pixels, context loss and
// restore, and the per-frame `draw`. A browser shell (the browser spec covers it): everything with logic in it lives
// in modules that test without a GL context.

import { NeutralToneMapping, OrthographicCamera, Scene, WebGLRenderer } from 'three';
import { viewBounds } from '../camera.js';
import { appLog } from '../app-log.js';
import { createBloom } from './bloom.js';
import { createQuality, LOOK_ALL, lookFor, lookItems, QUALITY_LEVELS, supportsFloatTargets } from './quality.js';
import { chooseRenderScale, isSoftwareRenderer, rendererName, scaledSize } from './software.js';

/**
 * What a layer is. `object` goes into the scene (back to front by position in the list); the hooks are optional.
 * @typedef {object} Layer
 * @property {any} object the `Object3D` to draw
 * @property {(frame: Frame) => void} [update] writes this frame's data into the layer's buffers and uniforms
 * @property {(renderer: any, camera: any) => void} [prerender] renders into the layer's own targets before the frame
 * @property {(width: number, height: number) => void} [resize] the canvas changed, in device pixels
 * @property {(level: number) => void} [setQuality] the quality level changed
 * @property {(look: import('./quality.js').Look) => void} [setLook] the Phase 6 look items that draw, and each
 *   item's tier, changed (with the level or once after a build)
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
 * @property {import('../camera.js').CameraController} camera the view
 * @property {{temperature: boolean, scent: boolean, territory: boolean, vision: boolean, calls: boolean}} lenses
 * @property {number} selectedId the selected agent's genome id, 0 for none
 * @property {number} followId the followed agent's genome id, 0 for none
 * @property {number} leadLineageId the leading lineage's id, 0 for none
 * @property {number} season the current season index (0: spring, 1: summer, 2: autumn, 3: winter)
 * @property {number} seasonProgress the progress through the season [0, 1]
 * @property {import('../family-slots.js').FamilySlots} family the family colour slots and the palette
 */

/**
 * @typedef {object} LayerSet
 * @property {Layer[]} layers back to front, drawn before the bloom
 * @property {Layer[]} afterBloom drawn over the bloomed frame (the ambient motes)
 */

/**
 * @typedef {object} SceneContext
 * @property {any} renderer the `WebGLRenderer`
 * @property {Record<string, any>} info `ready.info`
 * @property {{width: number, height: number}} size the canvas in device pixels
 */

/**
 * @typedef {object} Built
 * @property {any} main the scene drawn before the bloom
 * @property {any} motes the scene drawn after it
 * @property {LayerSet} set the layers
 * @property {ReturnType<typeof createBloom> | null} bloom the bloom pipeline, null when float targets are missing
 */

/**
 * @typedef {object} Rig
 * @property {any} renderer the renderer
 * @property {any} camera the orthographic camera
 * @property {import('./quality.js').Quality} quality the quality state
 * @property {{width: number, height: number}} size the size drawn at in device pixels: the canvas size times `renderScale`
 * @property {number} renderScale 1, or `SOFTWARE_RENDER_SCALE` on a software renderer
 * @property {Record<string, any>} info `ready.info`
 * @property {(context: SceneContext) => LayerSet} buildLayers makes the layers
 * @property {Built} built the current layers and scenes
 * @property {boolean} lost whether the context is lost
 * @property {number} lookMask the `?look=` mask: the Phase 6 items that may draw
 * @property {string} lookDrawn the items drawn at the current level, comma-joined, for `LookChanged`
 */

const BOUNDS = { left: 0, right: 0, top: 0, bottom: 0 };

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
 * @param {Rig} rig the rig
 * @param {(layer: Layer) => void} each what to call on every layer, both sets
 * @returns {void}
 */
function eachAll(rig, each) {
    eachLayer(rig.built.set.layers, each);
    eachLayer(rig.built.set.afterBloom, each);
}

/**
 * @param {Layer[]} layers the layers
 * @param {any} scene where their objects go
 * @returns {void}
 */
function mount(layers, scene) {
    layers.forEach((layer, index) => {
        layer.object.renderOrder = index;
        scene.add(layer.object);
    });
}

/**
 * @param {Omit<Rig, 'built'>} rig the rig without its layers
 * @returns {Built} freshly built layers, scenes and bloom
 */
function build(rig) {
    const main = new Scene();
    const motes = new Scene();
    const set = rig.buildLayers({ renderer: rig.renderer, info: rig.info, size: rig.size });
    mount(set.layers, main);
    mount(set.afterBloom, motes);
    const bloom =
        rig.quality.floor === 0
            ? createBloom({ renderer: rig.renderer, scene: main, camera: rig.camera, ...rig.size })
            : null;
    return { main, motes, set, bloom };
}

/**
 * @param {Rig} rig the rig
 * @param {number} level the wanted level; clamped to what the context allows
 * @returns {void}
 */
function setLevel(rig, level) {
    rig.quality.level = Math.max(rig.quality.floor, Math.min(2, level));
    rig.built.bloom?.setScale(QUALITY_LEVELS[rig.quality.level].bloomScale);
    eachAll(rig, (l) => l.setQuality?.(rig.quality.level));
    const look = lookFor(rig.quality.level, rig.lookMask);
    eachAll(rig, (l) => l.setLook?.(look));
    const drawn = lookItems(look).join(',');
    if (drawn !== rig.lookDrawn) {
        rig.lookDrawn = drawn;
        appLog('info', 'LookChanged', { level: rig.quality.level, items: drawn });
    }
}

/**
 * Applies `rig.size` to the renderer, the bloom and the layers.
 * @param {Rig} rig the rig
 * @returns {void}
 */
function applySize(rig) {
    rig.renderer.setSize(rig.size.width, rig.size.height, false);
    rig.built.bloom?.setSize(rig.size.width, rig.size.height);
    eachAll(rig, (l) => l.resize?.(rig.size.width, rig.size.height));
}

/**
 * @param {Rig} rig the rig
 * @param {number} width the canvas width in device pixels
 * @param {number} height the canvas height in device pixels
 * @returns {void}
 */
function resizeRig(rig, width, height) {
    Object.assign(rig.size, scaledSize({ width, height }, rig.renderScale));
    applySize(rig);
}

/** The rig and frame being drawn, read by the per-layer callbacks below so `drawRig` allocates no closures. */
const DRAWING = { rig: /** @type {Rig | null} */ (null), frame: /** @type {Frame | null} */ (null) };

/**
 * @param {Layer} layer the layer
 * @returns {void}
 */
function updateLayer(layer) {
    layer.update?.(/** @type {Frame} */ (DRAWING.frame));
}

/**
 * @param {Layer} layer the layer
 * @returns {void}
 */
function prerenderLayer(layer) {
    const rig = /** @type {Rig} */ (DRAWING.rig);
    layer.prerender?.(rig.renderer, rig.camera);
}

/**
 * @param {Rig} rig the rig
 * @param {Frame} frame the frame to draw
 * @returns {boolean} false when the context is lost and nothing was drawn
 */
function drawRig(rig, frame) {
    if (rig.lost) {
        return false;
    }
    Object.assign(rig.camera, viewBounds(frame.camera, BOUNDS));
    rig.camera.updateProjectionMatrix();
    DRAWING.rig = rig;
    DRAWING.frame = frame;
    eachAll(rig, updateLayer);
    eachLayer(rig.built.set.layers, prerenderLayer);
    DRAWING.rig = null;
    DRAWING.frame = null;
    const level = QUALITY_LEVELS[rig.quality.level];
    if (level.bloom && rig.built.bloom !== null) {
        rig.built.bloom.render();
    } else {
        rig.renderer.clear();
        rig.renderer.render(rig.built.main, rig.camera);
    }
    if (level.motes > 0) {
        rig.renderer.render(rig.built.motes, rig.camera);
    }
    return true;
}

/**
 * @returns {any} a `WebGLRenderer` set up for a flat, depthless, cleared-by-hand black frame
 */
function createRenderer() {
    const renderer = new WebGLRenderer({
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    renderer.toneMapping = NeutralToneMapping;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;background:#000';
    return renderer;
}

/**
 * Frees every layer and builds them again from `buildLayers`, at the current size and quality level.
 * @param {Rig} rig the rig
 * @param {() => void} disposeAll frees the old layers and the bloom
 * @returns {void}
 */
function rebuildRig(rig, disposeAll) {
    disposeAll();
    rig.built = build(rig);
    applySize(rig);
    setLevel(rig, rig.quality.level);
    rig.lost = false;
}

/**
 * Stops drawing while the context is lost and rebuilds every layer when it comes back.
 * @param {Rig} rig the rig
 * @param {HTMLCanvasElement} canvas the canvas the events fire on
 * @param {{disposeAll: () => void, onRestored?: () => void}} hooks frees the old layers; tells the caller
 * @returns {() => void} removes the listeners
 */
function watchContext(rig, canvas, { disposeAll, onRestored }) {
    const onLost = (/** @type {Event} */ event) => {
        event.preventDefault();
        rig.lost = true;
        appLog('warn', 'ContextLost');
    };
    const onRestore = () => {
        rebuildRig(rig, disposeAll);
        appLog('info', 'ContextRestored');
        onRestored?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestore);
    return () => {
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestore);
    };
}

/**
 * @param {any} renderer the renderer
 * @param {number | null} quality pinned quality
 * @param {number | null} scale pinned render scale
 * @returns {{renderScale: number, state: import('./quality.js').Quality}} the detected settings
 */
function detectHardware(renderer, quality, scale) {
    const name = rendererName(renderer.getContext());
    const software = isSoftwareRenderer(name);
    const renderScale = chooseRenderScale({ software, override: scale });
    const state = createQuality({ pinned: quality, floatTargets: supportsFloatTargets(renderer.extensions), software });
    if (software) {
        appLog('info', 'SoftwareRenderer', { renderer: name, renderScale, level: state.level });
    }
    return { renderScale, state };
}

/**
 * @param {{container: HTMLElement, info: Record<string, any>, buildLayers: (context: SceneContext) => LayerSet,
 *   quality?: number | null, scale?: number | null, look?: number, onRestored?: () => void}} options `container` receives the canvas; `buildLayers` makes
 *   the layers (and is called again after a context restore); `quality` pins a level and `scale` the render scale;
 *   `look` is the `?look=` mask (`LOOK_ALL` by default), which only removes items from what a level draws
 * @returns {{canvas: HTMLCanvasElement, renderer: any, quality: import('./quality.js').Quality,
 *   resize: (width: number, height: number) => void, draw: (frame: Frame) => boolean,
 *   setQualityLevel: (level: number) => void, rebuild: () => void, isLost: () => boolean, dispose: () => void}} the scene
 */
export function createScene({
    container,
    info,
    buildLayers,
    quality = null,
    scale = null,
    look = LOOK_ALL,
    onRestored,
}) {
    const renderer = createRenderer();
    const canvas = renderer.domElement;
    container.appendChild(canvas);
    const { renderScale, state } = detectHardware(renderer, quality, scale);
    const base = {
        renderer,
        camera: new OrthographicCamera(-1, 1, 1, -1, -1, 1),
        quality: state,
        renderScale,
        size: { width: 1, height: 1 },
        info,
        buildLayers,
        lost: false,
        lookMask: look,
        lookDrawn: '',
    };
    /** @type {Rig} */
    const rig = { ...base, built: build(base) };
    const disposeAll = () => {
        eachAll(rig, (l) => l.dispose());
        rig.built.bloom?.dispose();
    };
    const unwatch = watchContext(rig, canvas, { disposeAll, onRestored });
    setLevel(rig, rig.quality.level);
    return {
        canvas,
        renderer,
        quality: rig.quality,
        resize: (w, h) => resizeRig(rig, w, h),
        draw: (frame) => drawRig(rig, frame),
        setQualityLevel: (level) => setLevel(rig, level),
        rebuild: () => rebuildRig(rig, disposeAll),
        isLost: () => rig.lost,
        dispose() {
            unwatch();
            disposeAll();
            renderer.dispose();
            canvas.remove();
        },
    };
}
