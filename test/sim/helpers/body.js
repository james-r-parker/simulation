import { writeLaneBases } from '../../../js/sim/lane-state.js';
import { allocAgent } from '../../../js/sim/world.js';

/**
 * Allocates an agent slot with the body an unevolved genome gives it: vision, size and child-share traits of 1, every
 * lane at its specialisation's base, and leaky units that take each new value whole. A hand-built agent has no weights
 * row to derive them from.
 * @param {any} w the world
 * @param {number} [spec] its specialisation (the slot's current one by default)
 * @returns {number} the slot
 */
export function allocBody(w, spec) {
    const slot = allocAgent(w);
    w.vision[slot] = 1;
    w.baseSize[slot] = w.config.baseSize;
    w.childShare[slot] = w.config.childEnergyShare;
    w.leakRate.fill(1, slot * w.layout.hidden, (slot + 1) * w.layout.hidden);
    setSpec(w, slot, spec ?? w.spec[slot]);
    return slot;
}

/**
 * Sets a hand-built agent's specialisation and writes its lanes at that specialisation's bases.
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {number} spec the specialisation
 * @returns {void}
 */
export function setSpec(w, slot, spec) {
    w.spec[slot] = spec;
    writeLaneBases(w, slot);
}
