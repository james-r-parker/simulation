// Carcasses (world-balance.md T54): a dead agent leaves a `meat` food item holding a share of its energy.

/** The `foodKind` codes: ordinary plant food is 0, a carcass is 1. */
export const FOOD_KIND = Object.freeze({ PLANT: 0, MEAT: 1 });

/** @typedef {import('./world.js').World} World */

/**
 * Leaves a carcass at a dying agent's place: a meat item of `carcassShare` x the energy the
 * agent took in over its life (`foodEnergy` plus `biteEnergy`, both zeroed when the slot is freed), as large as the
 * agent. A body is worth what it built itself from; an agent that took in nothing leaves none. Like spawned plant
 * food it enters the ledger only when eaten, so the death still books out just the agent's remaining energy. It
 * takes the lowest free food slot, so it counts toward `maxFood`; with none free, no carcass appears. Draws nothing
 * from any RNG stream.
 * @param {World} world the world
 * @param {number} slot the agent that is about to be freed
 * @returns {void}
 */
export function leaveCarcass(world, slot) {
    const value = world.config.carcassShare * (world.foodEnergy[slot] + world.biteEnergy[slot]);
    if (!(value > 0)) {
        return;
    }
    const { foodAlive } = world;
    for (let food = 0; food < foodAlive.length; food++) {
        if (foodAlive[food] === 0) {
            foodAlive[food] = 1;
            world.foodKind[food] = FOOD_KIND.MEAT;
            world.foodX[food] = world.x[slot];
            world.foodY[food] = world.y[slot];
            world.foodRadius[food] = world.size[slot];
            world.foodValue[food] = value;
            world.foodAge[food] = 0;
            world.foodCount += 1;
            return;
        }
    }
}
