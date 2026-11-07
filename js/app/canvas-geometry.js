// Maps between the page's client pixels and the canvas's device pixels. The canvas is drawn at `size` device pixels and
// shown at its CSS size, so the two differ by a ratio that is not always 1.

/**
 * @typedef {object} CanvasView
 * @property {{width: number, height: number}} size the canvas's drawing size in device px
 * @property {{scene: {canvas?: {getBoundingClientRect: () => {left: number, top: number, width: number,
 *   height: number}}} | null}} deps the scene, which holds the canvas
 */

/**
 * @param {CanvasView} app the page
 * @param {{x: number, y: number}} client a point in client pixels
 * @returns {{x: number, y: number}} the same point in device pixels on the canvas, (-1, -1) before the scene exists
 */
export function clientToDevice(app, client) {
    const r = app.deps.scene?.canvas?.getBoundingClientRect();
    if (!r) {
        return { x: -1, y: -1 };
    }
    return {
        x: ((client.x - r.left) * app.size.width) / r.width,
        y: ((client.y - r.top) * app.size.height) / r.height,
    };
}

/**
 * @param {CanvasView} app the page
 * @param {{x: number, y: number}} device a point in device pixels on the canvas
 * @returns {{x: number, y: number}} the same point in client pixels, the device point itself before the scene exists
 */
export function deviceToClient(app, device) {
    const r = app.deps.scene?.canvas?.getBoundingClientRect();
    if (!r) {
        return { x: device.x, y: device.y };
    }
    return {
        x: r.left + (device.x * r.width) / app.size.width,
        y: r.top + (device.y * r.height) / app.size.height,
    };
}

/**
 * @param {CanvasView} app the page
 * @returns {number} device pixels per CSS pixel on the canvas, 1 before the scene exists
 */
export function devicePerCss(app) {
    const width = app.deps.scene?.canvas?.getBoundingClientRect().width ?? 0;
    return width > 0 ? app.size.width / width : 1;
}
