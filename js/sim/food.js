// Spawns food each tick at a rate per world area, and ages it out.

import { nextFloat } from './rng.js';
import { spawnFoodItem } from './spawn.js';
import { removeFood } from './world.js';
import { FOOD_KIND, FOOD_ORIGIN } from './carcass.js';

/** @typedef {import('./world.js').World} World */

/** The area `foodRegrowPerArea` is quoted per, in px2. */
const AREA_UNIT = 1000000;

/**
 * Area-based food: `foodRegrowPerArea` items per tick per 1,000,000 px2 of world (the season reaches the food through the patches' regrowth). Where
 * the items land (the patches by stock, then the background share) is `spawnFoodItem`'s job.
 * @param {World} world the world
 * @returns {number} the expected spawns this tick
 */
function areaExpected(world) {
    const c = world.config;
    return (c.foodRegrowPerArea * c.worldWidth * c.worldHeight) / AREA_UNIT;
}

/**
 * Spawns this tick's food: a whole part plus one more with the fractional probability.
 * Always draws exactly one float from the `food` stream for the fraction.
 * @param {World} world the world
 * @returns {void}
 */
export function spawnFood(world) {
    const c = world.config;
    const food = world.foodCount;
    const expected = areaExpected(world);
    const whole = Math.floor(expected);
    const fraction = expected - whole;
    const extra = nextFloat(world.rng.food) < fraction ? 1 : 0;
    const count = Math.min(c.maxFood - food, whole + extra);
    for (let i = 0; i < count; i++) {
        spawnFoodItem(world);
    }
}

/**
 * Ages one alive food item by a tick. A blob carcass priced by the body (`carcassBody`) loses value linearly: its value
 * falls from the stored value to 0 over `carcassFadeTicks` (each tick keeps `(life - age) / (life - age + 1)` of it) and
 * it is gone at age `life`. Every other item lasts its `life` and keeps its value.
 * @param {World} world the world
 * @param {number} i the food slot
 * @returns {void}
 */
function ageItem(world, i) {
    const { foodAge, foodKind, foodOrigin, foodLife } = world;
    foodAge[i] += 1;
    const meat = foodKind[i] === FOOD_KIND.MEAT;
    const herd = foodOrigin[i] === FOOD_ORIGIN.HERD_CARCASS;
    if (meat && !herd && world.config.carcassBody) {
        const left = foodLife[i] - foodAge[i];
        if (left <= 0) {
            removeFood(world, i);
        } else {
            world.foodValue[i] *= left / (left + 1);
        }
        return;
    }
    const life = !meat || (herd && foodLife[i] > 0) ? foodLife[i] : world.config.carcassTicks;
    if (foodAge[i] > life) {
        removeFood(world, i);
    }
}

/**
 * Ages every alive food item by one tick and removes those older than `foodLife` (a carcass: `carcassTicks`, or
 * `carcassFadeTicks` with `carcassBody`).
 * @param {World} world the world
 * @returns {void}
 */
export function ageFood(world) {
    const { foodAlive } = world;
    for (let i = 0; i < foodAlive.length; i++) {
        if (foodAlive[i] === 1) {
            ageItem(world, i);
        }
    }
}
