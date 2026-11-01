// Ages depleted patches and their soil seed banks in slot order.
import { EVENT_TYPE, pushEvent } from './events.js';
import { nextFloat } from './rng.js';

/** Stock below this share of the floor is continuously depleted. */
const NEAR_FLOOR = 1.01;
/** The floor is five percent of a patch's capacity. */
export const PATCH_FLOOR_SHARE = 0.05;

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch banked patch slot
 * @returns {boolean} whether the slot sprouts this tick
 */
function ageBank(world, patch) {
    if (world.patchBank[patch] === 0) {
        return false;
    }
    const sprouts = nextFloat(world.rng.flora) < world.config.sproutRate;
    world.patchBank[patch]--;
    if (sprouts) {
        world.patchAlive[patch] = 1;
        world.patchBank[patch] = 0;
        world.patchSerial[patch]++;
        world.patchStock[patch] = world.config.seedStock * world.config.foodPatchCapacity;
    }
    return sprouts;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch patch slot
 * @returns {boolean} whether regrowth should run for this patch
 */
export function stepPatchLife(world, patch) {
    if (world.patchAlive[patch] !== 1) {
        return ageBank(world, patch);
    }
    const c = world.config;
    const depleted = world.patchStock[patch] <= PATCH_FLOOR_SHARE * c.foodPatchCapacity * NEAR_FLOOR;
    world.patchLowTicks[patch] = depleted ? world.patchLowTicks[patch] + 1 : 0;
    if (world.patchLowTicks[patch] < c.patchDieTicks) {
        return true;
    }
    world.patchAlive[patch] = 0;
    world.patchStock[patch] = 0;
    world.patchWeight[patch] = 0;
    world.patchLowTicks[patch] = 0;
    world.patchBank[patch] = c.seedBankTicks;
    const at = pushEvent(world.events, EVENT_TYPE.PATCH_DIED, world.tick);
    world.events.data[at + 2] = patch;
    world.events.data[at + 3] = world.patchSpecies[patch];
    return false;
}
