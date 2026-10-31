// Chooses a flora source and copies its traits to a new food item.
import { FLORA_NAMES } from './config-flora.js';
import { pickPatch } from './food-patches.js';
import { nextFloat } from './rng.js';

/**
 * @param {import('./world.js').World} world the world
 * @returns {number} a patch slot, or -1 for grass
 */
function patchSource(world) {
    const c = world.config;
    return c.foodPatchCount > 0 && nextFloat(world.rng.food) >= c.foodBackgroundShare
        ? pickPatch(world, world.rng.food)
        : -1;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch patch slot or -1
 * @param {number} mark mark slot or -1
 * @returns {void}
 */
function sourceDisc(world, patch, mark) {
    const disc = world.floraDisc;
    disc.localOnly = mark >= 0;
    if (mark >= 0) {
        disc.cx = world.myceliumX[mark];
        disc.cy = world.myceliumY[mark];
        disc.discRadius = world.config.myceliumRadius;
    } else {
        disc.cx = world.patchX[patch];
        disc.cy = world.patchY[patch];
        disc.discRadius = world.config.foodPatchRadius;
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot food slot
 * @param {number} species species index
 * @param {number} patch source patch or -1
 * @returns {number} food slot
 */
function writeItem(world, slot, species, patch) {
    const c = world.config;
    const row = c.flora[FLORA_NAMES[species]];
    world.foodAlive[slot] = 1;
    world.foodKind[slot] = 0;
    world.foodX[slot] = world.point[0];
    world.foodY[slot] = world.point[1];
    world.foodRadius[slot] = row.radius * c.foodRadius;
    const energy = patch >= 0 ? world.patchEnergy[patch] : row.energy;
    world.foodValue[slot] = c.foodEnergy * (energy + (2 * nextFloat(world.rng.food) - 1) * row.energySpread);
    world.foodSpecies[slot] = species;
    world.foodHue[slot] = patch >= 0 ? world.patchHue[patch] : row.hue;
    world.foodTox[slot] = 0;
    world.foodLife[slot] = patch >= 0 ? world.patchLife[patch] : row.life;
    world.foodPatch[slot] = patch;
    world.foodAge[slot] = 0;
    world.foodCount++;
    return slot;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot the free food slot
 * @param {(world: any, rng: any, radius: number) => void} placeClear uniform placement
 * @param {(world: any, disc: any, radius: number) => boolean} placeInDisc local placement
 * @returns {number} the populated food slot
 */
export function spawnFloraItem(world, slot, placeClear, placeInDisc) {
    const c = world.config;
    const patch = patchSource(world);
    const species = patch >= 0 ? world.patchSpecies[patch] : 0;
    const radius = c.flora[FLORA_NAMES[species]].radius * c.foodRadius;
    if (patch >= 0) {
        sourceDisc(world, patch, -1);
        placeInDisc(world, world.floraDisc, radius);
    } else {
        placeClear(world, world.rng.food, radius);
    }
    return writeItem(world, slot, species, patch);
}
