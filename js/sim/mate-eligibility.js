// The conditions for mating: one agent being ready, and a pair being allowed to mate.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { birthBudgetSpent } from './birth-budget.js';
import { GATE, gateOpen } from './effects.js';
import { geneticDistance } from './genetics.js';
import { SEX } from './sex.js';
import { territoryAllows } from './territory.js';
import { childShareOf } from './traits.js';

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when the `mate` gate is open (no effect closes it: an immature, pregnant, recovering or
 *   out-of-band body cannot start a mating), above `mateMinEnergy` and allowed by its territory
 */
export function isReadyToMate(world, slot) {
    return (
        gateOpen(world, slot, GATE.MATE) &&
        world.energy[slot] > world.config.mateMinEnergy &&
        territoryAllows(world, slot)
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
 * @returns {number} the mother of the pair: the female
 */
export function motherOf(world, a, b) {
    return world.sex[a] === SEX.FEMALE ? a : b;
}

/**
 * @param {World} world the world
 * @param {number} mother the mother of a pair
 * @returns {boolean} true when she holds more than `childEnergyMin / childEnergyShare` and has not spent her birth budget
 */
export function canBear(world, mother) {
    return (
        !birthBudgetSpent(world, mother) &&
        world.energy[mother] > world.config.childEnergyMin / childShareOf(world, mother)
    );
}

/**
 * @param {World} world the world
 * @param {number} a an agent slot
 * @param {number} b another agent slot
 * @returns {boolean} true when both are ready, share a specialisation and are a female and a
 *   male, their sizes are within `mateSizeRatio`, their genetic distance is below `mateDistanceMax` (any when
 *   `Infinity`) and the mother holds more than `childEnergyMin / childEnergyShare` and has not spent her birth budget
 */
export function canMatePair(world, a, b) {
    if (world.spec[a] !== world.spec[b] || !readyToMate(world, a) || !readyToMate(world, b)) {
        return false;
    }
    if (world.sex[a] === world.sex[b]) {
        return false;
    }
    if (!canBear(world, motherOf(world, a, b))) {
        return false;
    }
    const ratio = world.size[a] / world.size[b];
    const limit = world.config.mateSizeRatio;
    if (ratio > limit || ratio < 1 / limit) {
        return false;
    }
    const { mateDistanceMax } = world.config;
    return mateDistanceMax === Infinity || geneticDistance(world, a, b) < mateDistanceMax;
}
