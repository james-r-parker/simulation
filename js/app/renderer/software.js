// Software rendering: telling that WebGL runs on the CPU (SwiftShader, llvmpipe), and the lighter drawing it gets.
// A CPU rasteriser cannot fill a full-size frame with bloom at a usable rate, so the scene starts at the lowest
// quality level and draws into a smaller frame that the browser scales up.

/** The share of the device-pixel canvas size a software renderer draws at; the CSS size stays 100%. */
export const SOFTWARE_RENDER_SCALE = 0.5;

const SOFTWARE_PATTERN = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/**
 * @param {string | null | undefined} name the `UNMASKED_RENDERER_WEBGL` (or `RENDERER`) string
 * @returns {boolean} whether it names a software rasteriser: SwiftShader, llvmpipe, softpipe, a "Software" renderer or
 *   Microsoft Basic Render, in any case
 */
export function isSoftwareRenderer(name) {
    return typeof name === 'string' && SOFTWARE_PATTERN.test(name);
}

/**
 * @param {{getExtension: (name: string) => any, getParameter: (pname: number) => unknown, RENDERER: number} | null} gl a
 *   WebGL context
 * @returns {string} the unmasked renderer string when `WEBGL_debug_renderer_info` is there, else the plain `RENDERER`
 *   string; empty when neither can be read
 */
export function rendererName(gl) {
    if (gl === null) {
        return '';
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const value = gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL);
    return typeof value === 'string' ? value : '';
}

/**
 * @param {{width: number, height: number}} size the canvas size in device pixels
 * @param {number} scale the render scale, above 0 and at most 1
 * @returns {{width: number, height: number}} the size drawn at, rounded, at least 1 x 1
 */
export function scaledSize(size, scale) {
    return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}
