// Mouse and touch on the canvas: one pointer dragging pans, two pointers pinch to zoom about their midpoint and pan as
// it moves, the wheel zooms about the cursor and a click or tap without a drag picks the agent under it. Pure over
// injected callbacks: the page turns DOM events into these calls.

import { panByPixels, pinchAt, screenToWorld, wheelFactor, zoomAt } from './camera.js';
import { pickAgent } from './picking.js';

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
 */

/**
 * @typedef {{down: (x: number, y: number, id?: number, touch?: boolean) => void,
 *   move: (x: number, y: number, id?: number) => void, up: (x: number, y: number, id?: number) => void,
 *   cancel: (id?: number) => void, wheel: (deltaY: number, x: number, y: number) => void}} PointerInput
 *   handlers; every coordinate is in device pixels from the canvas top left and `id` is the event's `pointerId`
 */

/**
 * @typedef {object} Gesture
 * @property {Map<number, {x: number, y: number}>} points the pointers down, by id
 * @property {number} startX where the first pointer went down
 * @property {number} startY where the first pointer went down
 * @property {boolean} dragged whether the gesture moved past the threshold or ever had two pointers
 * @property {boolean} touch whether the first pointer was a touch
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
 * @param {PointerInputOptions} options the camera, the agents to pick from, their drawn minimums and the pick callback
 * @returns {PointerInput} the handlers
 */
export function createPointerInput({ camera, getAgents, getMinPx, onPick, getTouchMinPx }) {
    /** @type {Gesture} */
    const g = { points: new Map(), startX: 0, startY: 0, dragged: false, touch: false };
    const world = { x: 0, y: 0 };
    const minPxFor = pickMinimums(getMinPx, getTouchMinPx);
    return {
        down(x, y, id = 0, touch = false) {
            if (g.points.size === 0) {
                Object.assign(g, { startX: x, startY: y, dragged: false, touch });
            } else {
                g.dragged = true;
            }
            g.points.set(id, { x, y });
        },
        move(x, y, id = 0) {
            const point = g.points.get(id);
            if (point === undefined) {
                return;
            }
            TO.x = x;
            TO.y = y;
            if (g.points.size >= 2) {
                pinch(camera, g.points, point, TO);
            } else {
                drag(camera, g, point, TO);
            }
        },
        up(x, y, id = 0) {
            if (!g.points.delete(id)) {
                return;
            }
            if (g.points.size === 0 && !g.dragged) {
                screenToWorld(camera, { x, y }, world);
                onPick(pickAgent(getAgents(), world.x, world.y, { zoom: camera.zoom, minPx: minPxFor(g.touch) }));
            }
        },
        cancel(id = 0) {
            g.points.delete(id);
            g.dragged = true;
        },
        wheel(deltaY, x, y) {
            zoomAt(camera, wheelFactor(deltaY), { x, y });
        },
    };
}
