// Spawns food each tick at a rate per world area, and ages it out.

import { nextFloat } from './rng.js';
import { spawnFoodItem } from './spawn.js';
import { removeFood } from './world.js';
import { FOOD_KIND } from './carcass.js';

/** @typedef {import('./world.js').World} World */

/** The area `foodRegrowPerArea` is quoted per, in px2. */
const AREA_UNIT = 1000000;

/**
 * Area-based food: `foodRegrowPerArea` items per tick per 1,000,000 px2 of world, times the season's scarcity. Where
 * the items land (the patches by stock, then the background share) is `spawnFoodItem`'s job.
 * @param {World} world the world
 * @returns {number} the expected spawns this tick
 */
function areaExpected(world) {
    const c = world.config;
    const season = c.seasons[world.season[0]];
    return (c.foodRegrowPerArea * c.worldWidth * c.worldHeight * season.foodScarcity) / AREA_UNIT;
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
 * Ages every alive food item by one tick and removes those older than `foodLife` (a carcass: `carcassTicks`).
 * @param {World} world the world
 * @returns {void}
 */
export function ageFood(world) {
    const { foodAlive, foodAge, foodKind } = world;
    const { carcassTicks } = world.config;
    for (let i = 0; i < foodAlive.length; i++) {
        if (foodAlive[i] === 1) {
            foodAge[i] += 1;
            if (foodAge[i] > (foodKind[i] === FOOD_KIND.MEAT ? carcassTicks : world.foodLife[i])) {
                removeFood(world, i);
            }
        }
    }
}
