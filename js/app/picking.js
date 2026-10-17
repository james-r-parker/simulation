// Hit-testing a click against the agents as drawn this frame, at the radius they are drawn at.

import { drawnRadius } from './display-size.js';

/** The slack around an agent that still counts as a hit, in device pixels. */
export const PICK_TOLERANCE_PX = 12;

/**
 * @param {{count: number, x: Float32Array, y: Float32Array, size: Float32Array, spec: Uint32Array,
 *   genomeId: Uint32Array}} agents the interpolated agents
 * @param {number} worldX the click in world units
 * @param {number} worldY the click in world units
 * @param {{zoom: number, minPx: ArrayLike<number>}} view `zoom` is device pixels per world unit, which turns
 *   `PICK_TOLERANCE_PX` into world units; `minPx` is the least each specialisation is drawn across, so an agent is
 *   hit-tested at the radius it is drawn at
 * @returns {number} the `genomeId` of the nearest agent whose body, widened by the tolerance, holds the click; 0 when
 *   none does
 */
export function pickAgent(agents, worldX, worldY, { zoom, minPx }) {
    const slack = PICK_TOLERANCE_PX / zoom;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < agents.count; i++) {
        const dx = agents.x[i] - worldX;
        const dy = agents.y[i] - worldY;
        const reach = drawnRadius(agents.size[i], minPx[agents.spec[i]] ?? 0, zoom) + slack;
        const squared = dx * dx + dy * dy;
        if (squared <= reach * reach && squared < bestDistance) {
            bestDistance = squared;
            best = agents.genomeId[i];
        }
    }
    return best;
}

/**
 * @param {{count: number, size: Float32Array, lineageId: Uint32Array, genomeId: Uint32Array}} agents the interpolated
 *   agents
 * @param {number} lineageId the family
 * @returns {number} the `genomeId` of the family's largest agent (the lowest slot wins a tie), 0 when it has none alive
 */
export function largestOfLineage(agents, lineageId) {
    let best = 0;
    let bestSize = -Infinity;
    for (let i = 0; i < agents.count; i++) {
        if (agents.lineageId[i] === lineageId && agents.size[i] > bestSize) {
            bestSize = agents.size[i];
            best = agents.genomeId[i];
        }
    }
    return best;
}
