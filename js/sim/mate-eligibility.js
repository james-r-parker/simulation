// The conditions for mating: one agent being ready, and a pair being allowed to mate.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { blocksMating } from './temperature.js';

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when mature, not pregnant, off cooldown, above `mateMinEnergy` and not past a temperature stress
 *   threshold
 */
export function isReadyToMate(world, slot) {
    const { maturityTicks, mateMinEnergy } = world.config;
    return (
        world.ageTicks[slot] >= maturityTicks &&
        world.pregnancy[slot] === 0 &&
        world.cooldown[slot] === 0 &&
        world.energy[slot] > mateMinEnergy &&
        !blocksMating(world.config, world.temperature[slot])
    );
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when ready to mate and the brain wants to
 */
export function readyToMate(world, slot) {
    return isReadyToMate(world, slot) && world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MATE] > 0;
}

/**
 * @param {World} world the world
 * @param {number} a an agent slot
 * @param {number} b another agent slot
 * @returns {boolean} true when both are ready, share a specialisation, their sizes are within `huntSizeRatio` and the
 *   lower slot, the mother, holds more than `childEnergyMin / childEnergyShare`
 */
export function canMatePair(world, a, b) {
    if (world.spec[a] !== world.spec[b] || !readyToMate(world, a) || !readyToMate(world, b)) {
        return false;
    }
    const { childEnergyMin, childEnergyShare } = world.config;
    if (!(world.energy[Math.min(a, b)] > childEnergyMin / childEnergyShare)) {
        return false;
    }
    const ratio = world.size[a] / world.size[b];
    const limit = world.config.huntSizeRatio;
    return ratio <= limit && ratio >= 1 / limit;
}
