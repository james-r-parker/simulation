// Scavenge (natural-selection.md, Detectors). No event carries the food kind, so the observer reads it from the food
// arrays: a meat item that was alive at the end of the last observed tick and is gone now, before its age ran out
// (`carcassFadeTicks`, over which a blob carcass's value also falls each tick), was eaten (`foodGone`, set by `removeFood`; a rotted item is not a meal). The eater is the lowest alive slot that overlaps the item's last place and gained food
// energy this tick (`feed` walks the slots in order, so the lowest slot eats first). The energy counted is what `addEnergy` stored
// (`foodTaken`, set by `removeFood`).
//
// This scene only counts (`eaten`, `eatenByHunters`). `eval.carcass_meal_share` (carcass energy eaten over all meat
// energy, that is carcass energy plus the bite energy of the hunters) and `eval.carcass_hunter_share` (the share of the
// carcass energy eaten by `canHunt` agents) are computed in `scene-herd-metrics.js`, which adds the herd carcasses
// this scene leaves out.
//
// Counts run over the whole run, as the intent state's bite totals do.
// Preallocated arrays only.

import { FOOD_GONE } from '../sim/world.js';
import { FOOD_KIND, FOOD_ORIGIN } from '../sim/carcass.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createLossScene, noteLossBase } from './scene-carcass-loss.js';
import { noteScavengeMeal, tickScent } from './scene-scent.js';

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
        age: new Uint32Array(food),
        liveSince: new Float64Array(food),
        mark: new Float64Array(config.maxAgents),
        scent: null,
        lastTick: -1,
        eaten: 0,
        eatenByHunters: 0,
        loss: createLossScene(),
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {Float64Array} mark each slot's food energy at the end of the last tick
 * @param {Record<string, any>} scene the carcass scene's previous food positions
 * @param {number} food the vanished item slot
 * @returns {number} the lowest alive slot that gained food energy and overlaps the item, or -1
 */
function eaterOf(world, mark, scene, food) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        const dx = world.x[slot] - scene.x[food];
        const dy = world.y[slot] - scene.y[food];
        const reach = world.size[slot] + scene.radius[food];
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
    const eater = eaterOf(world, scene.mark, scene, food);
    if (eater < 0) {
        return;
    }
    const energy = world.foodTaken[food];
    scene.eaten += energy;
    scene.eatenByHunters += observer.intent.hunterSpec[world.spec[eater]] === 1 ? energy : 0;
    if (scene.scent !== null) {
        scene.scent.mealX = scene.x[food];
        scene.scent.mealY = scene.y[food];
        scene.scent.mealSince = scene.liveSince[food];
        noteScavengeMeal(scene.scent, world, eater);
    }
}

/** @param {Record<string, any>} world @param {number} food @returns {boolean} */
function trackableMeat(world, food) {
    return (
        world.foodAlive[food] === 1 &&
        world.foodKind[food] === FOOD_KIND.MEAT &&
        world.foodOrigin[food] !== FOOD_ORIGIN.HERD_CARCASS
    );
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} food @returns {boolean} */
function eatenSinceLastTick(scene, world, food) {
    const same = sameCarcass(scene, world, food);
    return scene.value[food] > 0 && !same && world.foodGone[food] === FOOD_GONE.EATEN;
}

/**
 * Compares the meat items of the last tick with now, credits the eaten ones, and stores this tick's meat. Run once a
 * tick after the step.
 * @param {Record<string, any>} scene the carcass scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {Record<string, any> | undefined} scent observer-only scent detector state
 * @returns {void}
 */
export function trackCarcasses(scene, observer, world, scent = undefined) {
    scene.scent = scent ?? null;
    if (scent !== undefined) {
        tickScent(scent, world);
    }
    noteLossBase(scene.loss, world);
    const { foodAlive, foodKind } = world;
    const last = scene.value;
    for (let food = 0; food < foodAlive.length; food++) {
        // A slot that held no tracked meat last tick and holds no meat now has nothing to compare or to store.
        if (last[food] === 0 && (foodAlive[food] !== 1 || foodKind[food] !== FOOD_KIND.MEAT)) {
            continue;
        }
        updateCarcassSlot(scene, observer, world, food);
    }
    scene.mark.set(world.foodEnergy);
    scene.lastTick = world.tick;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world @param {number} food */
function updateCarcassSlot(scene, observer, world, food) {
    const meat = trackableMeat(world, food);
    const eaten = world.tick > BURN_IN_TICKS && eatenSinceLastTick(scene, world, food);
    const continuing = meat && sameCarcass(scene, world, food);
    if (!meat && !eaten) {
        scene.liveSince[food] = 0;
    } else if (meat && !continuing) {
        scene.liveSince[food] = world.tick;
    }
    if (eaten) {
        creditEaten(scene, observer, world, food);
    }
    scene.value[food] = meat ? world.foodValue[food] : 0;
    scene.x[food] = world.foodX[food];
    scene.y[food] = world.foodY[food];
    scene.radius[food] = world.foodRadius[food];
    scene.age[food] = world.foodAge[food];
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} food @returns {boolean} */
function sameCarcass(scene, world, food) {
    return (
        trackableMeat(world, food) &&
        scene.value[food] > 0 &&
        world.foodValue[food] <= scene.value[food] &&
        world.foodX[food] === scene.x[food] &&
        world.foodY[food] === scene.y[food] &&
        world.foodAge[food] === scene.age[food] + Math.max(1, world.tick - scene.lastTick)
    );
}
