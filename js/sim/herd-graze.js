// Lets calm herd animals remove nearby plant items and assimilate a share into their world-held stores.

import { FOOD_KIND } from './carcass.js';
import { depletePatchAt } from './food-patches.js';
import { removeFood } from './world.js';

/** @typedef {import('./world.js').World} World */

/** @param {World} world @param {number} animal @returns {number} nearest overlapping plant slot, or -1 */
function nearestPlant(world, animal) {
    let best = -1;
    let bestDistance = Infinity;
    const reach = world.config.herdRadius;
    for (let food = 0; food < world.foodAlive.length; food++) {
        if (world.foodAlive[food] !== 1 || world.foodKind[food] !== FOOD_KIND.PLANT) {
            continue;
        }
        const dx = world.foodX[food] - world.herdX[animal];
        const dy = world.foodY[food] - world.herdY[animal];
        const sumRadius = reach + world.foodRadius[food];
        const distance = dx * dx + dy * dy;
        if (distance <= sumRadius * sumRadius && distance < bestDistance) {
            best = food;
            bestDistance = distance;
        }
    }
    return best;
}

/** @param {World} world @param {number} animal @param {number} food @returns {void} */
function eatPlant(world, animal, food) {
    const { foodX, foodY, foodValue } = world;
    const x = foodX[food];
    const y = foodY[food];
    const value = foodValue[food];
    removeFood(world, food);
    depletePatchAt(world, x, y);
    world.herdStore[animal] = Math.min(
        world.config.herdStoreMax,
        world.herdStore[animal] + world.config.herdAssimilation * value,
    );
    world.herdGraze[animal] = world.config.herdGrazeTicks;
    world.herdTotals[0] += value;
}

/** Grazes one tick for each eligible animal. @param {World} world @returns {void} */
export function grazeHerds(world) {
    for (let animal = 0; animal < world.herdMax; animal++) {
        if (world.herdAlive[animal] !== 1) {
            continue;
        }
        if (world.herdGraze[animal] > 0) {
            world.herdGraze[animal]--;
            continue;
        }
        const food = nearestPlant(world, animal);
        if (food >= 0) {
            eatPlant(world, animal, food);
        }
    }
}
