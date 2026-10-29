import { allocAgent } from '../../../js/sim/world.js';

/**
 * Allocates an agent slot with the body an unevolved genome gives it: vision, size and child-share traits of 1 and
 * leaky units that take each new value whole. A hand-built agent has no weights row to derive them from.
 * @param {any} w the world
 * @returns {number} the slot
 */
export function allocBody(w) {
    const slot = allocAgent(w);
    w.vision[slot] = 1;
    w.baseSize[slot] = w.config.baseSize;
    w.childShare[slot] = w.config.childEnergyShare;
    w.leakRate.fill(1, slot * w.layout.hidden, (slot + 1) * w.layout.hidden);
    return slot;
}
