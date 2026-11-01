// Ages herd animals, births calves into clear nearby space, and returns part of dead animals' stores as food.

import { detCos, detSin } from './det-math.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { addFertileZone } from './environment.js';
import { addMyceliumMark } from './mycelium.js';
import { nextFloat } from './rng.js';
import { FOOD_KIND, FOOD_ORIGIN } from './carcass.js';

const LIFE_SPREAD = 0.25;
const TWO_PI = 6.283185307179586;
const CALF_DISTANCE = 2.2;
const BIRTH_ATTEMPTS = 8;

/** @typedef {import('./world.js').World} World */

/** @param {World} world @param {number} animal @returns {boolean} */
export function leaveHerdCarcass(world, animal) {
    const value = world.config.carcassShare * world.herdStore[animal];
    if (!(value > 0)) {
        return true;
    }
    for (let food = 0; food < world.foodAlive.length; food++) {
        if (world.foodAlive[food] !== 0) {
            continue;
        }
        world.foodAlive[food] = 1;
        world.foodKind[food] = FOOD_KIND.MEAT;
        world.foodOrigin[food] = FOOD_ORIGIN.HERD_CARCASS;
        world.foodX[food] = world.herdX[animal];
        world.foodY[food] = world.herdY[animal];
        world.foodRadius[food] = world.config.herdRadius;
        world.foodValue[food] = value;
        world.foodAge[food] = 0;
        world.foodHue[food] = 0;
        world.foodTox[food] = 0;
        world.foodLife[food] = world.config.herdCarcassTicks;
        world.foodPatch[food] = -1;
        world.foodCount++;
        return true;
    }
    return false;
}

/** @param {World} world @param {number} group @param {number} animal @returns {void} */
function die(world, group, animal) {
    const age = world.herdAge[animal];
    const store = world.herdStore[animal];
    const old = age >= world.herdLife[animal];
    const offset = pushEvent(world.events, EVENT_TYPE.HERD_ANIMAL_DIED, world.tick);
    world.events.data[offset + 2] = group;
    world.events.data[offset + 3] = animal;
    world.events.data[offset + 4] = age;
    world.events.data[offset + 5] = store;
    world.events.data[offset + 6] = Number(old);
    if (!leaveHerdCarcass(world, animal)) {
        const lost = pushEvent(world.events, EVENT_TYPE.HERD_CARCASS_LOST, world.tick);
        world.events.data[lost + 2] = group;
    }
    addFertileZone(world, world.herdX[animal], world.herdY[animal], world.config.herdRadius);
    addMyceliumMark(world, { x: world.herdX[animal], y: world.herdY[animal], size: world.config.herdRadius });
    world.herdAlive[animal] = 0;
    world.herdStore[animal] = 0;
    world.herdAge[animal] = 0;
    world.herdLife[animal] = 0;
    world.herdGraze[animal] = 0;
    world.herdX[animal] = 0;
    world.herdY[animal] = 0;
    world.herdVx[animal] = 0;
    world.herdVy[animal] = 0;
    world.groupAnimalCount[group]--;
}

/** @param {World} world @param {number} mother @param {{x: number, y: number}} point @param {number} diameter @returns {boolean} */
function clearOfAnimals(world, mother, point, diameter) {
    const diameterSq = diameter * diameter;
    for (let other = 0; other < world.herdAlive.length; other++) {
        if (other === mother || world.herdAlive[other] !== 1) {
            continue;
        }
        const dx = point.x - world.herdX[other];
        const dy = point.y - world.herdY[other];
        if (dx * dx + dy * dy < diameterSq) {
            return false;
        }
    }
    return true;
}

/** @param {World} world @param {number} x @param {number} y @param {number} radius @returns {boolean} */
function clearOfRocks(world, x, y, radius) {
    for (let rock = 0; rock < world.obsRadius.length; rock++) {
        const dx = x - world.obsX[rock];
        const dy = y - world.obsY[rock];
        const clearance = radius + world.obsRadius[rock];
        if (dx * dx + dy * dy < clearance * clearance) {
            return false;
        }
    }
    return true;
}

/** @param {World} world @param {number} mother @param {number} x @param {number} y @returns {boolean} */
function clearCalfPosition(world, mother, x, y) {
    const radius = world.config.herdRadius;
    if (x < radius || x > world.config.worldWidth - radius || y < radius || y > world.config.worldHeight - radius) {
        return false;
    }
    const point = { x, y };
    return clearOfAnimals(world, mother, point, 2 * radius) && clearOfRocks(world, x, y, radius);
}

/** @param {World} world @param {number} mother @returns {boolean} */
function calfPosition(world, mother) {
    const rng = world.rng.herds;
    const distance = CALF_DISTANCE * world.config.herdRadius;
    for (let attempt = 0; attempt < BIRTH_ATTEMPTS; attempt++) {
        const angle = nextFloat(rng) * TWO_PI;
        const x = world.herdX[mother] + distance * detCos(angle);
        const y = world.herdY[mother] + distance * detSin(angle);
        if (clearCalfPosition(world, mother, x, y)) {
            world.point[0] = x;
            world.point[1] = y;
            return true;
        }
    }
    return false;
}

/** @param {World} world @param {number} group @returns {number} */
function eligibleMother(world, group) {
    const start = group * world.config.herdSize;
    const end = start + world.config.herdSize;
    for (let animal = start; animal < end; animal++) {
        if (
            world.herdAlive[animal] === 1 &&
            world.herdAge[animal] >= world.config.herdBirthTicks &&
            world.herdStore[animal] >= world.config.herdBirthEnergy
        ) {
            return animal;
        }
    }
    return -1;
}

/** @param {World} world @param {number} group @returns {number} */
function freeCalfSlot(world, group) {
    const start = group * world.config.herdSize;
    const end = start + world.config.herdSize;
    for (let animal = start; animal < end; animal++) {
        if (world.herdAlive[animal] === 0) {
            return animal;
        }
    }
    return -1;
}

/** @param {World} world @param {number} group @returns {void} */
function tryBirth(world, group) {
    if (
        world.groupAnimalCount[group] >= world.config.herdSize ||
        world.groupBirthTimer[group] > 0 ||
        world.groupAlarm[group] > 0
    ) {
        return;
    }
    const mother = eligibleMother(world, group);
    const calf = freeCalfSlot(world, group);
    if (mother < 0 || calf < 0 || !calfPosition(world, mother)) {
        return;
    }
    world.herdStore[mother] -= world.config.herdBirthEnergy;
    world.herdAlive[calf] = 1;
    world.herdGroup[calf] = group;
    world.herdX[calf] = world.point[0];
    world.herdY[calf] = world.point[1];
    world.herdVx[calf] = 0;
    world.herdVy[calf] = 0;
    world.herdAge[calf] = 0;
    world.herdLife[calf] = Math.floor(
        world.config.herdLifeTicks * (1 - LIFE_SPREAD + 2 * LIFE_SPREAD * nextFloat(world.rng.herds)),
    );
    world.herdStore[calf] = world.config.herdCalfEnergy;
    world.herdGraze[calf] = 0;
    world.herdId[calf] = world.herdNextId++;
    world.groupAnimalCount[group]++;
    world.groupBirthTimer[group] = world.config.herdBirthTicks;
    const offset = pushEvent(world.events, EVENT_TYPE.HERD_ANIMAL_BORN, world.tick);
    world.events.data[offset + 2] = group;
    world.events.data[offset + 3] = calf;
}

/** Advances lifespan and store-gated births once per field tick. @param {World} world @returns {void} */
export function ageAndReproduceHerds(world) {
    for (let group = 0; group < world.config.herdCount; group++) {
        if (world.groupBirthTimer[group] > 0) {
            world.groupBirthTimer[group]--;
        }
        const start = group * world.config.herdSize;
        const end = start + world.config.herdSize;
        for (let animal = start; animal < end; animal++) {
            if (world.herdAlive[animal] !== 1) {
                continue;
            }
            world.herdAge[animal]++;
            if (world.herdAge[animal] >= world.herdLife[animal]) {
                die(world, group, animal);
            }
        }
        tryBirth(world, group);
    }
}
