// The renderer's construction options and settings, and the rule for repeated device losses. Pure, so the stage's
// choices are tested without a GPU.

/** A second device loss within this many ms is a failure, not a rebuild. */
export const LOSS_WINDOW_MS = 10000;
/** MSAA samples on the canvas. */
export const MSAA_SAMPLES = 4;

/**
 * @param {string | null | undefined} forced `?backend=`: `webgpu`, `webgl2` or absent
 * @param {{isFallbackAdapter?: boolean} | null} adapter the high-performance WebGPU adapter's info, null without one
 * @returns {'webgpu' | 'webgl2'} WebGPU on a hardware adapter; WebGL2 without an adapter or on a software fallback
 *   adapter (headless Chromium's SwiftShader, whose device cannot present); a forced value wins
 */
export function chooseBackend(forced, adapter) {
    if (forced === 'webgpu' || forced === 'webgl2') {
        return forced;
    }
    return adapter === null || adapter.isFallbackAdapter === true ? 'webgl2' : 'webgpu';
}

/**
 * @param {{backend?: string | null, gputime?: boolean}} params the chosen backend (`chooseBackend`) and `?gputime=`
 * @returns {Record<string, any>} the `WebGPURenderer` options: MSAA, no alpha, depth or stencil, the high-performance
 *   adapter, timestamp queries only when asked for and the WebGL2 backend when chosen
 */
export function stageOptions({ backend = null, gputime = false }) {
    return {
        antialias: true,
        samples: MSAA_SAMPLES,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        trackTimestamp: gputime === true,
        forceWebGL: backend === 'webgl2',
    };
}

/**
 * Sets what keeps the canvas crisp and black: colour management off (every colour is a display value), no tone mapping
 * and a linear output space (no framebuffer target, so MSAA stays on the canvas), a black clear and ratio 1 (sizes are
 * given in device pixels).
 * @param {any} renderer the renderer
 * @param {{ColorManagement: any, NoToneMapping: number, LinearSRGBColorSpace: string}} three the three exports
 * @returns {void}
 */
export function configureRenderer(renderer, { ColorManagement, NoToneMapping, LinearSRGBColorSpace }) {
    ColorManagement.enabled = false;
    renderer.toneMapping = NoToneMapping;
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = true;
    renderer.setPixelRatio(1);
}

/**
 * @param {{lastLossMs: number}} state when the previous loss happened, -Infinity before one
 * @param {number} nowMs this loss's time
 * @returns {'rebuild' | 'fail'} rebuild after a first loss, fail after a second one inside `LOSS_WINDOW_MS`
 */
export function lossVerdict(state, nowMs) {
    const verdict = nowMs - state.lastLossMs < LOSS_WINDOW_MS ? 'fail' : 'rebuild';
    state.lastLossMs = nowMs;
    return verdict;
}

/**
 * @param {any} renderer an initialised renderer
 * @returns {'webgpu' | 'webgl2'} the backend it runs on
 */
export function backendOf(renderer) {
    return renderer.backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
}
