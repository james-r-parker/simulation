// Per-slot values derived from an agent's genome row: leak rates, body traits and the plastic `fastOut` block.
// `applyGenes` runs after every write of a weight row, so nothing derived is ever stale.

import { TRAIT_INDEX } from './brain-layout.js';
import { detSigmoid, detTanh } from './det-math.js';
import { resetFastOut } from './hebbian.js';

/** The smallest leak rate: a unit with a very negative leak gene still moves 5% toward its target each tick. */
export const LEAK_MIN = 0.05;

/** A trait gene moves its trait by at most this fraction of the default: 0.7 to 1.3. */
export const TRAIT_SPAN = 0.3;

/** The largest value of any trait, which the spatial hash and the cell-size check must cover. */
export const TRAIT_MAX = 1 + TRAIT_SPAN;

/**
 * Maps a trait gene to a multiplier of the trait's default.
 * @param {number} gene the trait gene
 * @returns {number} `1 + TRAIT_SPAN x tanh(gene)`, in `(0.7, 1.3)`; a gene of 0 gives 1
 */
export function traitValue(gene) {
    return 1 + TRAIT_SPAN * detTanh(gene);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {number} the slot's ray length: its specialisation's `visionRange` times its vision trait
 */
export function visionOf(world, slot) {
    const base = world.visionBySpec[world.spec[slot]];
    return base * world.vision[slot];
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @returns {number} the slot's base size: `baseSize` times its size trait
 */
export function baseSizeOf(world, slot) {
    return world.baseSize[slot];
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the mother's slot
 * @returns {number} the share of its energy the mother gives a mating child
 */
export function childShareOf(world, slot) {
    return world.childShare[slot];
}

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
    const genes = slot * layout.weightCount + layout.traitStart;
    world.vision[slot] = traitValue(weights[genes + TRAIT_INDEX.VISION]);
    world.baseSize[slot] = config.baseSize * traitValue(weights[genes + TRAIT_INDEX.SIZE]);
    world.childShare[slot] = config.childEnergyShare * traitValue(weights[genes + TRAIT_INDEX.CHILD_SHARE]);
    if (config.hebbianRate > 0) {
        resetFastOut(world, slot);
    }
    const H = layout.hidden;
    const leakGenes = slot * layout.weightCount + layout.leakStart;
    for (let j = 0; j < H; j++) {
        world.leakRate[slot * H + j] = leakRateOf(weights[leakGenes + j]);
    }
}
