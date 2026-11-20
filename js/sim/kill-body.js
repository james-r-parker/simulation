// The kill is the body (honest-budgets.md Phase 2). A bite that leaves its victim at or under `killShare` x its
// maximum energy is fatal. The killer then takes up to `killGorgeShare` of the victim's remaining energy, no more than `killGorgeCap` (and its own
// headroom), and what it does not take leaves the victim as a bite loss and is held in `carcassHeld` for the carcass
// `leaveCarcass` leaves, so a killed body's store is 0. With `killShare` 0 nothing remains to take or hold and the kill
// is today's. A blob carcass fades linearly over `carcassFadeTicks`.
//
// `carcassHeld` (allocated in `allocateWorld`) is derived state: zeroed by `freeAgent`, outside `worldHash`, no RNG, no allocation per tick.

import { LOSS_CAUSE, removeEnergy, transferEnergy } from './energy.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {number} victimMax the victim's maximum energy
 * @returns {number} the energy at or under which a bite kills (0: only an empty store)
 */
export function killLine(config, victimMax) {
    return config.killShare * victimMax;
}

/**
 * Settles a killed victim that still holds energy: the killer takes up to `killGorgeShare` of it, at most `killGorgeCap` (and what fits its
 * store, so none is lost to overflow), the rest is removed from the victim as `LOSS_CAUSE.BITE` and held for its carcass. Leaves the victim at 0.
 * @param {Record<string, any>} world the world
 * @param {number} biter the killing slot
 * @param {number} victim the killed slot, still holding energy
 * @returns {number} the energy the killer stored
 */
export function takeBody(world, biter, victim) {
    const headroom = world.maxEnergyBySpec[world.spec[biter]] - world.energy[biter];
    const victimEnergy = world.energy[victim];
    const shareCap = world.config.killGorgeShare * victimEnergy;
    transferEnergy(world, victim, biter, Math.min(victimEnergy, shareCap, world.config.killGorgeCap, headroom));
    const stored = world.transferGained;
    world.biteEnergy[biter] += stored;
    world.carcassHeld[victim] += removeEnergy(world, victim, world.energy[victim], LOSS_CAUSE.BITE);
    return stored;
}
