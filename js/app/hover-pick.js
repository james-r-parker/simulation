// Which agent is under the pointer, for the hover peek: the same hit test a click uses, answered as an index into the
// blended agents.

import { screenToWorld } from './camera.js';
import { pickAgent } from './picking.js';
import { findAgent } from './renderer/overlays.js';

const WORLD = { x: 0, y: 0 };
const POINT = { x: 0, y: 0 };

/**
 * @param {{agents: import('./interpolate.js').Interpolated, camera: import('./camera.js').CameraController,
 *   minPx: ArrayLike<number>}} view the agents as drawn, the camera and the least each type is drawn across
 * @param {{x: number, y: number}} device the pointer in device pixels from the canvas top left
 * @returns {{agents: import('./interpolate.js').Interpolated, index: number} | null} the agent under it and the agents
 *   it indexes, null when there is none
 */
export function agentAt({ agents, camera, minPx }, device) {
    POINT.x = device.x;
    POINT.y = device.y;
    screenToWorld(camera, POINT, WORLD);
    const id = pickAgent(agents, WORLD.x, WORLD.y, { zoom: camera.zoom, minPx });
    if (id === 0) {
        return null;
    }
    const index = findAgent(agents, id);
    return index < 0 ? null : { agents, index };
}
