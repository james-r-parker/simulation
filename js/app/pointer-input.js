// Mouse and touch on the canvas: one pointer dragging pans, two pointers pinch to zoom about their midpoint and pan as
// it moves, the wheel zooms about the cursor and a click or tap without a drag picks the agent under it. Pure over
// injected callbacks: the page turns DOM events into these calls.

import { moveCameraTo, panByPixels, pinchAt, screenToWorld, wheelFactor, zoomAt } from './camera.js';
import { pickAgent } from './picking.js';
import { BROWSER_TIMERS, createDoubleTap, createLongPress, TAP_SLOP_PX, TWO_FINGER_TAP_MS } from './touch-gestures.js';

/** A press that moves less than this many device pixels is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * @typedef {object} PointerInputOptions
 * @property {import('./camera.js').CameraController} camera the view
 * @property {() => import('./interpolate.js').Interpolated} getAgents the agents as last drawn
 * @property {() => ArrayLike<number>} getMinPx the least each specialisation is drawn across, in device px
 * @property {(genomeId: number) => void} onPick called with the picked genome id, 0 for empty space
 * @property {() => number} [getTouchMinPx] the least any agent is hit-tested across for a touch, in device px; a tap
 *   picks with each specialisation's `getMinPx` raised to it. Absent means a touch picks like a mouse
 * @property {(genomeId: number, x: number, y: number) => void} [onLongPress] called when a touch is held still over an
 *   agent, with its genome id and the press point in device px; the release then picks nothing
 * @property {() => number} [now] the clock in ms, `performance.now` by default
 * @property {import('./touch-gestures.js').Timers} [timers] the timers, the browser's by default
 */

/**
 * @typedef {{down: (x: number, y: number, id?: number, touch?: boolean) => void,
 *   move: (x: number, y: number, id?: number) => void, up: (x: number, y: number, id?: number) => void,
 *   cancel: (id?: number) => void, wheel: (deltaY: number, x: number, y: number) => void}} PointerInput
 *   handlers; every coordinate is in device pixels from the canvas top left and `id` is the event's `pointerId`
 */

/**
 * @typedef {object} Gesture
 * @property {Map<number, {x: number, y: number, sx: number, sy: number}>} points the pointers down, by id, with where each went down
 * @property {number} startX where the first pointer went down
 * @property {number} startY where the first pointer went down
 * @property {boolean} dragged whether the gesture moved past the threshold or ever had two pointers
 * @property {boolean} touch whether the first pointer was a touch
 * @property {number} peak the most pointers that were down together
 * @property {number} pairAt when the second pointer went down, in ms
 * @property {boolean} spread whether a pointer of a two-pointer gesture moved past `TAP_SLOP_PX`
 */

/** Scratch for `pinch`, so a pointer move allocates nothing. */
const BEFORE = { x: 0, y: 0, d: 0 };
const AFTER = { x: 0, y: 0, d: 0 };
const TO = { x: 0, y: 0 };

/**
 * @param {Map<number, {x: number, y: number}>} points the pointers down, at least two
 * @param {{x: number, y: number, d: number}} out receives the first two pointers' midpoint and distance
 * @returns {{x: number, y: number, d: number}} `out`
 */
function pairOf(points, out) {
    let n = 0;
    let ax = 0;
    let ay = 0;
    for (const p of points.values()) {
        if (n === 0) {
            ax = p.x;
            ay = p.y;
        } else {
            out.x = (ax + p.x) / 2;
            out.y = (ay + p.y) / 2;
            out.d = Math.hypot(ax - p.x, ay - p.y);
            break;
        }
        n++;
    }
    return out;
}

/**
 * @param {() => ArrayLike<number>} getMinPx each specialisation's drawn minimum, in device px
 * @param {(() => number) | undefined} getTouchMinPx the touch floor, in device px
 * @returns {(touch: boolean) => ArrayLike<number>} the minimums a pick uses: for a touch, each raised to the floor
 */
function pickMinimums(getMinPx, getTouchMinPx) {
    /** @type {number[]} */
    const raised = [];
    return (touch) => {
        const base = getMinPx();
        if (!touch || getTouchMinPx === undefined) {
            return base;
        }
        const floor = getTouchMinPx();
        raised.length = base.length;
        for (let i = 0; i < base.length; i++) {
            raised[i] = Math.max(base[i], floor);
        }
        return raised;
    };
}

/**
 * Moves one of two pointers: zooms by the change in their distance and keeps the world point between the fingers
 * under their midpoint.
 * @param {import('./camera.js').CameraController} camera the view
 * @param {Map<number, {x: number, y: number}>} points the pointers down, two of them
 * @param {{x: number, y: number}} point the moving pointer's record
 * @param {{x: number, y: number}} to where it moved, in device px
 * @returns {void}
 */
function pinch(camera, points, point, to) {
    const before = pairOf(points, BEFORE);
    point.x = to.x;
    point.y = to.y;
    const after = pairOf(points, AFTER);
    pinchAt(camera, before.d > 0 && after.d > 0 ? after.d / before.d : 1, before, after);
}

/**
 * Moves the only pointer: once it has gone past `DRAG_THRESHOLD_PX` from where it went down, pans with it.
 * @param {import('./camera.js').CameraController} camera the view
 * @param {Gesture} g the gesture
 * @param {{x: number, y: number}} point the pointer's record
 * @param {{x: number, y: number}} to where it moved, in device px
 * @returns {void}
 */
function drag(camera, g, point, to) {
    if (Math.hypot(to.x - g.startX, to.y - g.startY) >= DRAG_THRESHOLD_PX) {
        g.dragged = true;
    }
    if (g.dragged) {
        panByPixels(camera, to.x - point.x, to.y - point.y);
    }
    point.x = to.x;
    point.y = to.y;
}

/**
 * Records a pointer going down: the first starts a gesture, another joins it and makes it a drag.
 * @param {Gesture} g the gesture
 * @param {{x: number, y: number, id: number, touch: boolean}} down the press
 * @param {number} nowMs the time
 * @returns {boolean} whether this press started a fresh gesture
 */
function begin(g, { x, y, id, touch }, nowMs) {
    const fresh = g.points.size === 0 || (g.points.size === 1 && g.points.has(id));
    if (fresh) {
        Object.assign(g, { startX: x, startY: y, dragged: false, touch, peak: 0, spread: false });
    } else {
        g.dragged = true;
    }
    g.points.set(id, { x, y, sx: x, sy: y });
    g.peak = Math.max(g.peak, g.points.size);
    if (g.points.size === 2) {
        g.pairAt = nowMs;
    }
    return fresh;
}

/**
 * @param {import('./camera.js').CameraController} camera the view
 * @param {Gesture} g the gesture
 * @param {{x: number, y: number}} to where pointer `id` moved, in device px
 * @param {number} id the pointer
 * @returns {boolean} whether the move panned or pinched
 */
function moveBy(camera, g, to, id) {
    const point = g.points.get(id);
    if (point === undefined) {
        return false;
    }
    if (g.points.size >= 2) {
        g.spread ||= Math.hypot(to.x - point.sx, to.y - point.sy) > TAP_SLOP_PX;
        pinch(camera, g.points, point, to);
        return true;
    }
    drag(camera, g, point, to);
    return g.dragged;
}

/**
 * What a gesture does when it ends or is held: the pick, the long press, and the tap rules.
 * @param {PointerInputOptions} options the input's options
 * @param {Gesture} g the gesture
 * @returns {{press: {start: () => void, stop: () => void}, finish: (x: number, y: number) => void}} `press` is the long
 *   press timer; `finish` ends a gesture whose last pointer lifted at (x, y): a two-finger tap goes home, a second touch
 *   tap zooms in, any other tap picks
 */
function createEndings(options, g) {
    const { camera, getAgents, getMinPx, onPick, getTouchMinPx, onLongPress } = options;
    const now = options.now ?? (() => performance.now());
    const world = { x: 0, y: 0 };
    const minPxFor = pickMinimums(getMinPx, getTouchMinPx);
    const doubleTap = createDoubleTap(now);
    const pickAt = (/** @type {number} */ x, /** @type {number} */ y) => {
        screenToWorld(camera, { x, y }, world);
        return pickAgent(getAgents(), world.x, world.y, { zoom: camera.zoom, minPx: minPxFor(g.touch) });
    };
    const press = createLongPress({
        timers: options.timers ?? BROWSER_TIMERS,
        onFire() {
            const id = g.points.size === 1 && !g.dragged ? pickAt(g.startX, g.startY) : 0;
            if (id !== 0) {
                g.dragged = true;
                onLongPress?.(id, g.startX, g.startY);
            }
        },
    });
    const finish = (/** @type {number} */ x, /** @type {number} */ y) => {
        if (g.peak === 2 && !g.spread && now() - g.pairAt <= TWO_FINGER_TAP_MS) {
            moveCameraTo(camera, { x: camera.world.width / 2, y: camera.world.height / 2, zoom: 0 });
        } else if (g.peak === 1 && !g.dragged) {
            if (g.touch && doubleTap.tap(x, y)) {
                zoomAt(camera, 2, { x, y });
            } else {
                onPick(pickAt(x, y));
            }
        }
    };
    return { press, finish };
}

/**
 * @param {PointerInputOptions} options the camera, the agents to pick from, their drawn minimums and the pick callback
 * @returns {PointerInput} the handlers
 */
export function createPointerInput(options) {
    const { camera, onLongPress } = options;
    const now = options.now ?? (() => performance.now());
    /** @type {Gesture} */
    const g = {
        points: new Map(),
        startX: 0,
        startY: 0,
        dragged: false,
        touch: false,
        peak: 0,
        pairAt: 0,
        spread: false,
    };
    const { press, finish } = createEndings(options, g);
    return {
        down(x, y, id = 0, touch = false) {
            const fresh = begin(g, { x, y, id, touch }, now());
            if (!fresh) {
                press.stop();
            } else if (touch && onLongPress !== undefined) {
                press.start();
            }
        },
        move(x, y, id = 0) {
            TO.x = x;
            TO.y = y;
            if (moveBy(camera, g, TO, id)) {
                press.stop();
            }
        },
        up(x, y, id = 0) {
            if (g.points.delete(id)) {
                press.stop();
                if (g.points.size === 0) {
                    finish(x, y);
                }
            }
        },
        cancel(id = 0) {
            if (g.points.delete(id)) {
                g.dragged = true;
                press.stop();
            }
        },
        wheel(deltaY, x, y) {
            zoomAt(camera, wheelFactor(deltaY), { x, y });
        },
    };
}
