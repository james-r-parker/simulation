// A small world with one live slot, for the trait tests: set a gene, a span, then rebuild the slot's lanes.

import { createPreStep5Config } from '../../helpers/pre-step5.js';
import { applyTraits } from '../../../js/sim/body-traits.js';
import { TRAIT_SLOTS } from '../../../js/sim/brain-layout.js';
import { writeLaneBases } from '../../../js/sim/lane-state.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';
import { fixedSpecPolicy } from './test-policy.js';

/**
 * @param {number} [spec] the specialisation of every agent
 * @returns {{world: Record<string, any>, slot: number}} a world and its first live slot
 */
export function traitWorld(spec = 0) {
    const config = createPreStep5Config({ ...SIMPLE_WORLD, maxAgents: 6, initialAgents: 3, minAgents: 0 });
    const world = createWorld(config, fixedSpecPolicy(spec));
    return { world, slot: world.alive.indexOf(1) };
}

/**
 * Sets one trait gene of a slot.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {number} index the trait's gene index
 * @param {number} gene the gene
 * @returns {void}
 */
export function setGene(world, slot, index, gene) {
    world.weights[slot * world.layout.weightCount + world.layout.traitStart + index] = gene;
}

/**
 * Sets the span of a trait for the slot's specialisation.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {number} index the trait's gene index
 * @param {number} span the span
 * @returns {void}
 */
export function setSpan(world, slot, index, span) {
    world.traitSpans[world.spec[slot] * TRAIT_SLOTS + index] = span;
}

/**
 * Rebuilds the slot's lanes: its bases, then its traits.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {readonly any[]} [traits] a registry to apply instead of the real one
 * @returns {void}
 */
export function rebuild(world, slot, traits) {
    writeLaneBases(world, slot);
    applyTraits(world, slot, traits);
}
