// Lets calm herd animals remove nearby plant items and assimilate a share into their world-held stores.

import { FOOD_KIND } from './carcass.js';
import { eatFromPatch } from './food-patches.js';
import { FOOD_GONE, removeFood } from './world.js';
import { loadHerdSeed } from './herd-dung.js';

/** @typedef {import('./world.js').World} World */

/** Ascending plant slots near the current group, reused across ticks; grown only when a world needs more. */
let candidates = new Int32Array(0);

/**
 * Collects, in ascending slot order, the live plant items that could overlap an animal of the group whose eligible
 * animals span the given box. One pass over the food slots serves the whole group.
 * @param {World} world the world
 * @param {number} reach the animal radius
 * @param {Float64Array} box `[minX, minY, maxX, maxY]` of the eligible animals
 * @returns {number} how many slots were written to `candidates`
 */
function collectPlants(world, reach, box) {
    const { foodAlive, foodKind, foodX, foodY, foodRadius } = world;
    if (candidates.length < foodAlive.length) {
        candidates = new Int32Array(foodAlive.length);
    }
    let count = 0;
    for (let food = 0; food < foodAlive.length; food++) {
        if (foodAlive[food] !== 1 || foodKind[food] !== FOOD_KIND.PLANT) {
            continue;
        }
        const slack = reach + foodRadius[food];
        const x = foodX[food];
        const y = foodY[food];
        if (x >= box[0] - slack && x <= box[2] + slack && y >= box[1] - slack && y <= box[3] + slack) {
            candidates[count++] = food;
        }
    }
    return count;
}

/** @param {World} world @param {number} animal @param {number} count candidate slots in `candidates` @returns {number} nearest overlapping plant slot, or -1 */
function nearestPlant(world, animal, count) {
    let best = -1;
    let bestDistance = Infinity;
    const reach = world.config.herdRadius;
    for (let i = 0; i < count; i++) {
        const food = candidates[i];
        if (world.foodAlive[food] !== 1) {
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
    const { foodValue } = world;
    const value = foodValue[food];
    loadHerdSeed(world, animal, food);
    eatFromPatch(world, food);
    removeFood(world, food, FOOD_GONE.EATEN, value);
    world.herdStore[animal] = Math.min(
        world.config.herdStoreMax,
        world.herdStore[animal] + world.config.herdAssimilation * value,
    );
    world.herdGraze[animal] = world.config.herdGrazeTicks;
    world.herdTotals[0] += value;
}

const boxScratch = new Float64Array(4);

/**
 * Counts the animals ready to graze, and writes their bounding box to
 * `boxScratch`.
 * @param {World} world the world
 * @param {number} group the group
 * @returns {number} the ready count
 */
function readyBox(world, group) {
    const { herdSize } = world.config;
    let ready = 0;
    boxScratch[0] = boxScratch[1] = Infinity;
    boxScratch[2] = boxScratch[3] = -Infinity;
    for (let animal = group * herdSize; animal < (group + 1) * herdSize; animal++) {
        if (world.herdAlive[animal] !== 1 || world.herdGraze[animal] > 0) {
            continue;
        }
        ready++;
        boxScratch[0] = Math.min(boxScratch[0], world.herdX[animal]);
        boxScratch[1] = Math.min(boxScratch[1], world.herdY[animal]);
        boxScratch[2] = Math.max(boxScratch[2], world.herdX[animal]);
        boxScratch[3] = Math.max(boxScratch[3], world.herdY[animal]);
    }
    return ready;
}

/** Grazes one tick for each eligible animal. @param {World} world @returns {void} */
export function grazeHerds(world) {
    const { herdSize } = world.config;
    for (let group = 0; group < world.config.herdCount; group++) {
        if (world.groupAlarm[group] > 0) {
            world.groupAlarm[group]--;
            continue;
        }
        const ready = readyBox(world, group);
        const count = ready === 0 ? 0 : collectPlants(world, world.config.herdRadius, boxScratch);
        for (let animal = group * herdSize; animal < (group + 1) * herdSize; animal++) {
            if (world.herdAlive[animal] !== 1) {
                continue;
            }
            if (world.herdGraze[animal] > 0) {
                world.herdGraze[animal]--;
                continue;
            }
            const food = nearestPlant(world, animal, count);
            if (food >= 0) {
                eatPlant(world, animal, food);
            }
        }
    }
}
