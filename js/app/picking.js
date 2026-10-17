// Hit-testing a click against the agents as drawn this frame.

/** The slack around an agent that still counts as a hit, in device pixels. */
export const PICK_TOLERANCE_PX = 12;

/**
 * @param {{count: number, x: Float32Array, y: Float32Array, size: Float32Array, genomeId: Uint32Array}} agents the
 *   interpolated agents
 * @param {number} worldX the click in world units
 * @param {number} worldY the click in world units
 * @param {number} zoom device pixels per world unit, which turns `PICK_TOLERANCE_PX` into world units
 * @returns {number} the `genomeId` of the nearest agent whose body, widened by the tolerance, holds the click; 0 when
 *   none does
 */
export function pickAgent(agents, worldX, worldY, zoom) {
    const slack = PICK_TOLERANCE_PX / zoom;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < agents.count; i++) {
        const dx = agents.x[i] - worldX;
        const dy = agents.y[i] - worldY;
        const reach = agents.size[i] + slack;
        const squared = dx * dx + dy * dy;
        if (squared <= reach * reach && squared < bestDistance) {
            bestDistance = squared;
            best = agents.genomeId[i];
        }
    }
    return best;
}
