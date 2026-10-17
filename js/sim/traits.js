// Per-slot values derived from an agent's genome row: leak rates (and, in later tasks, body traits and `fastOut`).
// `applyGenes` runs after every write of a weight row, so nothing derived is ever stale.

import { detSigmoid } from './det-math.js';

/** The smallest leak rate: a unit with a very negative leak gene still moves 5% toward its target each tick. */
export const LEAK_MIN = 0.05;

/**
 * The share of the new value a hidden unit takes each tick.
 * @param {number} gene the unit's leak gene
 * @returns {number} `LEAK_MIN + (1 - LEAK_MIN) x sigmoid(gene)`, in `[LEAK_MIN, 1]`
 */
export function leakRateOf(gene) {
    return LEAK_MIN + (1 - LEAK_MIN) * detSigmoid(gene);
}

/**
 * Derives the slot's per-slot values from its weight row.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot whose `weights` row was just written
 * @returns {void}
 */
export function applyGenes(world, slot) {
    const { config, layout, weights } = world;
    if (config.leakEnabled) {
        const H = layout.hidden;
        const genes = slot * layout.weightCount + layout.leakStart;
        for (let j = 0; j < H; j++) {
            world.leakRate[slot * H + j] = leakRateOf(weights[genes + j]);
        }
    }
}
