// Pan, zoom, follow and programmed moves for the orthographic view. Positions are world units and the zoom is device
// pixels per world unit. Eased with the same rates as the legacy `Camera` (0.05 a frame for position and 0.1 for zoom
// at 60 Hz), expressed per second so the motion does not depend on the frame rate.

/** Position easing rate per second: `-ln(1 - 0.05) x 60`. */
export const POSITION_RATE = 3.08;
/** Zoom easing rate per second: `-ln(1 - 0.1) x 60`. */
export const ZOOM_RATE = 6.32;
/** How far the view may zoom out past the fit, and in from it, as multiples of the fit zoom. */
export const ZOOM_OUT = 0.8;
export const ZOOM_IN = 24;
/** Wheel pixels to a zoom factor: `exp(-deltaY x WHEEL_RATE)`. */
const WHEEL_RATE = 0.0015;
/** How close (as a share) a settled zoom must be to a whole-pixel ratio to snap to it. */
const SNAP_SHARE = 0.02;

/**
 * @param {{width: number, height: number}} canvas the canvas in device pixels
 * @param {{width: number, height: number}} world the world in world units
 * @returns {number} the zoom that fits the whole world; on 16:9 it fills the canvas with no letterbox
 */
export function fitZoom(canvas, world) {
    return Math.min(canvas.width / world.width, canvas.height / world.height);
}

/**
 * Moves a settled zoom to the nearest 1/k or k (k an integer) within 2% of it, which puts a world 2 or 3 times the
 * canvas width on whole pixels. Other zooms are returned as they are.
 * @param {number} zoom a zoom
 * @returns {number} the snapped zoom
 */
export function snapZoom(zoom) {
    const whole = Math.max(1, Math.round(zoom));
    const fraction = 1 / Math.max(1, Math.round(1 / zoom));
    const near = Math.abs(whole - zoom) <= Math.abs(fraction - zoom) ? whole : fraction;
    return Math.abs(near - zoom) <= SNAP_SHARE * zoom ? near : zoom;
}

/**
 * Eases a value towards a target; the same fraction of the gap closes per second whatever the frame rate.
 * @param {number} current the value
 * @param {number} target where it is going
 * @param {number} rate per second
 * @param {number} dtMs the frame time
 * @returns {number} the new value
 */
export function springStep(current, target, rate, dtMs) {
    return target + (current - target) * Math.exp((-rate * dtMs) / 1000);
}

/**
 * @typedef {object} CameraController
 * @property {number} x the view centre
 * @property {number} y the view centre
 * @property {number} zoom device pixels per world unit
 * @property {number} targetX where the centre is going
 * @property {number} targetY where the centre is going
 * @property {number} targetZoom where the zoom is going
 * @property {number} minZoom the lowest zoom
 * @property {number} maxZoom the highest zoom
 * @property {{width: number, height: number}} canvas the canvas in device pixels
 * @property {{width: number, height: number}} world the world in world units
 * @property {boolean} following whether `followStep` has driven the target and not been released
 */

/**
 * @param {CameraController} c the controller
 * @returns {void}
 */
function limits(c) {
    const fit = fitZoom(c.canvas, c.world);
    c.minZoom = fit * ZOOM_OUT;
    c.maxZoom = fit * ZOOM_IN;
    c.targetZoom = Math.min(Math.max(c.targetZoom, c.minZoom), c.maxZoom);
    c.targetX = Math.min(Math.max(c.targetX, 0), c.world.width);
    c.targetY = Math.min(Math.max(c.targetY, 0), c.world.height);
}

/**
 * @param {{canvas: {width: number, height: number}, world: {width: number, height: number}}} size canvas in device
 *   pixels and world in world units
 * @returns {CameraController} a controller showing the whole world
 */
export function createCameraController({ canvas, world }) {
    const zoom = fitZoom(canvas, world);
    /** @type {CameraController} */
    const c = {
        x: world.width / 2,
        y: world.height / 2,
        zoom,
        targetX: world.width / 2,
        targetY: world.height / 2,
        targetZoom: zoom,
        minZoom: zoom,
        maxZoom: zoom,
        canvas: { ...canvas },
        world: { ...world },
        following: false,
    };
    limits(c);
    return c;
}

/**
 * Eases the view towards its target.
 * @param {CameraController} c the controller
 * @param {number} dtMs the frame time
 * @returns {void}
 */
export function updateCamera(c, dtMs) {
    c.x = springStep(c.x, c.targetX, POSITION_RATE, dtMs);
    c.y = springStep(c.y, c.targetY, POSITION_RATE, dtMs);
    c.zoom = springStep(c.zoom, c.targetZoom, ZOOM_RATE, dtMs);
}

/**
 * Aims the view at a moving point (the followed agent) and eases towards it.
 * @param {CameraController} c the controller
 * @param {number} x the point in world units
 * @param {number} y the point in world units
 * @param {number} dtMs the frame time
 * @returns {void}
 */
export function followStep(c, x, y, dtMs) {
    c.following = true;
    c.targetX = x;
    c.targetY = y;
    updateCamera(c, dtMs);
}

/**
 * Pans by a drag. Dragging right moves the world right, so the view moves left; screen y points down, world y up.
 * Releases a follow.
 * @param {CameraController} c the controller
 * @param {number} dxPx the drag in device pixels
 * @param {number} dyPx the drag in device pixels
 * @returns {void}
 */
export function panByPixels(c, dxPx, dyPx) {
    c.following = false;
    c.targetX -= dxPx / c.zoom;
    c.targetY += dyPx / c.zoom;
    limits(c);
}

/**
 * Zooms by a factor keeping the world point under the cursor still.
 * @param {CameraController} c the controller
 * @param {number} factor above 1 zooms in
 * @param {{x: number, y: number}} anchorPx the cursor in device pixels from the canvas top left
 * @returns {void}
 */
export function zoomAt(c, factor, anchorPx) {
    const ox = anchorPx.x - c.canvas.width / 2;
    const oy = anchorPx.y - c.canvas.height / 2;
    const wx = c.targetX + ox / c.targetZoom;
    const wy = c.targetY - oy / c.targetZoom;
    c.targetZoom = c.targetZoom * factor;
    limits(c);
    c.targetX = wx - ox / c.targetZoom;
    c.targetY = wy + oy / c.targetZoom;
    limits(c);
}

/**
 * @param {number} deltaY a wheel event's `deltaY`
 * @returns {number} the zoom factor it stands for; scrolling up zooms in
 */
export function wheelFactor(deltaY) {
    return Math.exp(-deltaY * WHEEL_RATE);
}

/**
 * Tells the controller the canvas changed size. The zoom keeps its ratio to the fit.
 * @param {CameraController} c the controller
 * @param {{width: number, height: number}} canvas the new size in device pixels
 * @returns {void}
 */
export function resizeCamera(c, canvas) {
    const before = fitZoom(c.canvas, c.world);
    const ratio = c.zoom / before;
    const targetRatio = c.targetZoom / before;
    c.canvas = { ...canvas };
    const after = fitZoom(c.canvas, c.world);
    c.zoom = after * ratio;
    c.targetZoom = after * targetRatio;
    limits(c);
}

/**
 * Sets the view straight to a pose, e.g. `Home` or a director move.
 * @param {CameraController} c the controller
 * @param {{x: number, y: number, zoom: number}} pose the target; a zoom of 0 means the fit
 * @param {boolean} [instant] jump instead of easing
 * @returns {void}
 */
export function moveCameraTo(c, pose, instant = false) {
    c.following = false;
    c.targetX = pose.x;
    c.targetY = pose.y;
    c.targetZoom = pose.zoom > 0 ? pose.zoom : fitZoom(c.canvas, c.world);
    limits(c);
    if (instant) {
        c.x = c.targetX;
        c.y = c.targetY;
        c.zoom = c.targetZoom;
    }
}

/**
 * @param {CameraController} c the controller
 * @param {{x: number, y: number}} pointPx a point in device pixels from the canvas top left
 * @param {{x: number, y: number}} out receives the world point
 * @returns {{x: number, y: number}} `out`
 */
export function screenToWorld(c, pointPx, out) {
    out.x = c.x + (pointPx.x - c.canvas.width / 2) / c.zoom;
    out.y = c.y - (pointPx.y - c.canvas.height / 2) / c.zoom;
    return out;
}
