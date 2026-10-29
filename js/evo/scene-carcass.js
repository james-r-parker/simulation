// Scavenge (natural-selection.md, Detectors). No event carries the food kind, so the observer reads it from the food
// arrays: a meat item that was alive at the end of the last observed tick and is gone now, before its age ran out
// (`carcassTicks`), was eaten. The eater is the lowest alive slot that overlaps the item's last place and gained food
// energy this tick (`feed` walks the slots in order, so the lowest slot eats first). The energy counted is the item's
// value times the eater's `meatFoodValue` share, as `tryEat` credits it.
//
// - `eval.carcass_meal_share`: carcass energy eaten over all meat energy, that is carcass energy plus the bite energy
//   of the hunters (the intent state's hunter bite totals).
// - `eval.carcass_hunter_share`: the share of the carcass energy eaten by `canHunt` agents.
//
// Counts run over the whole run, as the intent state's bite totals do. Both read `null` with `carcassesEnabled` off.
// Preallocated arrays only.

import { FOOD_KIND } from '../sim/carcass.js';
import { none, ok } from './metrics-stats.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: the meat items of the last tick and each slot's food energy then
 */
export function createCarcassScene(config) {
    const food = config.maxFood;
    return {
        value: new Float64Array(food),
        x: new Float64Array(food),
        y: new Float64Array(food),
        radius: new Float64Array(food),
        mark: new Float64Array(config.maxAgents),
        eaten: 0,
        eatenByHunters: 0,
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {Float64Array} mark each slot's food energy at the end of the last tick
 * @param {{x: number, y: number, radius: number}} item the vanished item's last place and radius
 * @returns {number} the lowest alive slot that gained food energy and overlaps the item, or -1
 */
function eaterOf(world, mark, { x, y, radius }) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        const dx = world.x[slot] - x;
        const dy = world.y[slot] - y;
        const reach = world.size[slot] + radius;
        if (world.alive[slot] === 1 && world.foodEnergy[slot] > mark[slot] && dx * dx + dy * dy < reach * reach) {
            return slot;
        }
    }
    return -1;
}

/**
 * Credits a vanished meat item to its eater.
 * @param {Record<string, any>} scene the carcass scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} food the food slot
 * @returns {void}
 */
function creditEaten(scene, observer, world, food) {
    const item = { x: scene.x[food], y: scene.y[food], radius: scene.radius[food] };
    const eater = eaterOf(world, scene.mark, item);
    if (eater < 0) {
        return;
    }
    const energy = scene.value[food] * world.meatFoodBySpec[world.spec[eater]];
    scene.eaten += energy;
    scene.eatenByHunters += observer.intent.hunterSpec[world.spec[eater]] === 1 ? energy : 0;
}

/**
 * Compares the meat items of the last tick with now, credits the eaten ones, and stores this tick's meat. Run once a
 * tick after the step; does nothing with carcasses off.
 * @param {Record<string, any>} scene the carcass scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function trackCarcasses(scene, observer, world) {
    if (!world.config.carcassesEnabled) {
        return;
    }
    const { foodAlive, foodKind, foodValue, foodX, foodY, foodAge } = world;
    const { carcassTicks } = world.config;
    for (let food = 0; food < foodAlive.length; food++) {
        const meat = foodAlive[food] === 1 && foodKind[food] === FOOD_KIND.MEAT;
        const same = meat && foodValue[food] === scene.value[food] && foodX[food] === scene.x[food];
        if (scene.value[food] > 0 && !same && foodAge[food] <= carcassTicks) {
            creditEaten(scene, observer, world, food);
        }
        scene.value[food] = meat ? foodValue[food] : 0;
        scene.x[food] = foodX[food];
        scene.y[food] = foodY[food];
        scene.radius[food] = world.foodRadius[food];
    }
    scene.mark.set(world.foodEnergy);
}

/**
 * @param {Record<string, any>} scene the carcass scene
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two carcass metrics
 */
export function carcassMetrics(scene, observer) {
    if (!observer.config.carcassesEnabled) {
        const off = none('carcassesEnabled is off');
        return { 'eval.carcass_meal_share': off, 'eval.carcass_hunter_share': off };
    }
    const { huntBiteDeliberate, huntBiteChance } = observer.intent.run;
    const meat = scene.eaten + huntBiteDeliberate + huntBiteChance;
    return {
        'eval.carcass_meal_share': meat > 0 ? ok(scene.eaten / meat) : none('no meat eaten after burn-in'),
        'eval.carcass_hunter_share':
            scene.eaten > 0 ? ok(scene.eatenByHunters / scene.eaten) : none('no carcass eaten after burn-in'),
    };
}
