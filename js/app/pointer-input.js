// Mouse and touch on the canvas: drag pans, the wheel zooms about the cursor and a click without a drag picks the agent
// under it. Pure over injected callbacks: the page turns DOM events into these calls.

import { panByPixels, screenToWorld, wheelFactor, zoomAt } from './camera.js';
import { pickAgent } from './picking.js';

/** A press that moves less than this many device pixels is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * @typedef {object} PointerInputOptions
 * @property {import('./camera.js').CameraController} camera the view
 * @property {() => import('./interpolate.js').Interpolated} getAgents the agents as last drawn
 * @property {(genomeId: number) => void} onPick called with the picked genome id, 0 for empty space
 */

/**
 * @param {PointerInputOptions} options the camera, the agents to pick from and the pick callback
 * @returns {{down: (x: number, y: number) => void, move: (x: number, y: number) => void, up: (x: number, y: number) => void,
 *   wheel: (deltaY: number, x: number, y: number) => void}} handlers; every coordinate is in device pixels from the
 *   canvas top left
 */
export function createPointerInput({ camera, getAgents, onPick }) {
    const pressed = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, dragged: false };
    const world = { x: 0, y: 0 };
    return {
        down(x, y) {
            Object.assign(pressed, { active: true, startX: x, startY: y, lastX: x, lastY: y, dragged: false });
        },
        move(x, y) {
            if (!pressed.active) {
                return;
            }
            if (Math.hypot(x - pressed.startX, y - pressed.startY) >= DRAG_THRESHOLD_PX) {
                pressed.dragged = true;
            }
            if (pressed.dragged) {
                panByPixels(camera, x - pressed.lastX, y - pressed.lastY);
            }
            pressed.lastX = x;
            pressed.lastY = y;
        },
        up(x, y) {
            if (pressed.active && !pressed.dragged) {
                screenToWorld(camera, { x, y }, world);
                onPick(pickAgent(getAgents(), world.x, world.y, camera.zoom));
            }
            pressed.active = false;
        },
        wheel(deltaY, x, y) {
            zoomAt(camera, wheelFactor(deltaY), { x, y });
        },
    };
}
