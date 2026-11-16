// Carcasses (world-balance.md T54): a dead agent leaves a `meat` food item holding a share of its energy.

/** The `foodKind` codes: ordinary plant food is 0, a carcass is 1. */
export const FOOD_KIND = Object.freeze({ PLANT: 0, MEAT: 1 });

/** The origin of a food item; `NONE` is the existing plant and carcass baseline. */
export const FOOD_ORIGIN = Object.freeze({ NONE: 0, HERD_CARCASS: 1, DUNG_ZONE: 2 });

/** @typedef {import('./world.js').World} World */

/** The slots of `world.carcassLoss`: the energy of carcasses placed, the energy of bodies that found the food pool full, and their count. */
export const CARCASS_LOSS = Object.freeze({ PLACED: 0, LOST: 1, BODIES: 2 });

/**
 * Allocates the carcass loss counters (honest-budgets T33b). They are outside `worldHash` and the snapshot, so no golden moves.
 * @param {World} world the world being built
 * @returns {void}
 */
export function allocCarcassLoss(world) {
    world.carcassLoss = new Float64Array(3);
}

/**
 * @param {World} world the world
 * @param {number} slot the dying agent
 * @returns {number} the carcass's value: `carcassShare` x the energy the body holds at death (its store, plus what a
 *   kill left unclaimed in `carcassHeld`)
 */
function bodyValue(world, slot) {
    return world.config.carcassShare * (world.energy[slot] + world.carcassHeld[slot]);
}

/**
 * Leaves a carcass at a dying agent's place: a meat item of `carcassShare` x the energy the
 * body holds at death (see `bodyValue`), as large as the agent. An empty body leaves none. Like spawned plant
 * food it enters the ledger only when eaten, so the death still books out just the agent's remaining energy. It
 * takes the lowest free food slot, so it counts toward `maxFood`; with none free, no carcass appears and its value is booked as
 * lost in `world.carcassLoss` (a body that holds nothing books nothing). Draws nothing from any RNG stream.
 * @param {World} world the world
 * @param {number} slot the agent that is about to be freed
 * @returns {void}
 */
export function leaveCarcass(world, slot) {
    const value = bodyValue(world, slot);
    if (!(value > 0)) {
        return;
    }
    const { foodAlive } = world;
    for (let food = 0; food < foodAlive.length; food++) {
        if (foodAlive[food] === 0) {
            foodAlive[food] = 1;
            world.foodKind[food] = FOOD_KIND.MEAT;
            world.foodOrigin[food] = FOOD_ORIGIN.NONE;
            world.foodX[food] = world.x[slot];
            world.foodY[food] = world.y[slot];
            world.foodRadius[food] = world.size[slot];
            world.foodValue[food] = value;
            world.foodAge[food] = 0;
            world.foodHue[food] = 0;
            world.foodTox[food] = 0;
            world.foodLife[food] = world.config.carcassFadeTicks;
            world.foodPatch[food] = -1;
            world.foodCount += 1;
            world.carcassLoss[CARCASS_LOSS.PLACED] += value;
            return;
        }
    }
    world.carcassLoss[CARCASS_LOSS.LOST] += value;
    world.carcassLoss[CARCASS_LOSS.BODIES] += 1;
}
