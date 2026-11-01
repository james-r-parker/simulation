// Chooses a flora source and copies its traits to a new food item.
import { FLORA_NAMES } from './config-flora.js';
import { FOOD_ORIGIN } from './carcass.js';
import { ZONE_ORIGIN } from './environment.js';
import { fruitWeight } from './fruiting.js';
import { pickPatch } from './food-patches.js';
import { pickMark } from './mycelium.js';
import { nextFloat } from './rng.js';

/**
 * @param {import('./world.js').World} world the world
 * @returns {number} a live mark, or -1 for the patch/background draw
 */
function fungusMark(world) {
    let alive = false;
    for (let i = 0; i < world.myceliumTicks.length; i++) {
        if (world.myceliumTicks[i] > 0) {
            alive = true;
            break;
        }
    }
    if (!alive) {
        return -1;
    }
    const c = world.config;
    const fungus = c.flora.fungus;
    const chance = c.fertileZoneSpawnChance * fruitWeight(world.season[1], fungus.start, fungus.span);
    return nextFloat(world.rng.food) < chance ? pickMark(world) : -1;
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {number} a patch slot, or -1 for grass
 */
function patchSource(world) {
    const c = world.config;
    return hasPatches(world) && nextFloat(world.rng.food) >= c.foodBackgroundShare
        ? pickPatch(world, world.rng.food)
        : -1;
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {boolean} whether any living patch can be a source
 */
function hasPatches(world) {
    for (let i = 0; i < world.patchAlive.length; i++) {
        if (world.patchAlive[i] === 1) {
            return true;
        }
    }
    return false;
}

/**
 * Selects a live dung zone in proportion to its remaining fertility after the spawn chance succeeds.
 * @param {import('./world.js').World} world the world
 * @returns {number} a zone slot, or -1 when no dung source was selected
 */
function dungFertility(world) {
    let total = 0;
    for (let slot = 0; slot < world.zoneAlive.length; slot++) {
        if (world.zoneAlive[slot] === 1 && world.zoneOrigin[slot] === ZONE_ORIGIN.DUNG) {
            total += world.zoneFertility[slot];
        }
    }
    return total;
}

/** @param {import('./world.js').World} world @param {number} total @returns {number} */
function pickDungZone(world, total) {
    let last = -1;
    let target = nextFloat(world.rng.food) * total;
    for (let slot = 0; slot < world.zoneAlive.length; slot++) {
        if (world.zoneAlive[slot] === 1 && world.zoneOrigin[slot] === ZONE_ORIGIN.DUNG) {
            last = slot;
            target -= world.zoneFertility[slot];
            if (target < 0) {
                return slot;
            }
        }
    }
    return last;
}

/** @param {import('./world.js').World} world @returns {number} dung zone slot, or -1 */
function dungSource(world) {
    const total = dungFertility(world);
    if (total <= 0 || nextFloat(world.rng.food) >= world.config.fertileZoneSpawnChance) {
        return -1;
    }
    return pickDungZone(world, total);
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
    world.foodOrigin[slot] = FOOD_ORIGIN.NONE;
    world.foodX[slot] = world.point[0];
    world.foodY[slot] = world.point[1];
    world.foodRadius[slot] = row.radius * c.foodRadius;
    const energy = patch >= 0 ? world.patchEnergy[patch] : row.energy;
    world.foodValue[slot] = c.foodEnergy * (energy + (2 * nextFloat(world.rng.food) - 1) * row.energySpread);
    world.foodSpecies[slot] = species;
    world.foodHue[slot] = patch >= 0 ? world.patchHue[patch] : row.hue;
    world.foodTox[slot] = row.toxicity;
    world.foodLife[slot] = patch >= 0 ? world.patchLife[patch] : row.life;
    world.foodPatch[slot] = patch;
    world.foodPatchSerial[slot] = patch >= 0 ? world.patchSerial[patch] : 0;
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
    const mark = fungusMark(world);
    if (mark >= 0) {
        sourceDisc(world, -1, mark);
        if (placeInDisc(world, world.floraDisc, c.flora.fungus.radius * c.foodRadius)) {
            return writeItem(world, slot, FLORA_NAMES.indexOf('fungus'), -1);
        }
    }
    const dungZone = dungSource(world);
    if (dungZone >= 0) {
        const fungus = c.flora.fungus;
        const fungusWeight = fruitWeight(world.season[1], fungus.start, fungus.span);
        const species =
            fungusWeight > 0 && nextFloat(world.rng.food) < fungusWeight ? FLORA_NAMES.indexOf('fungus') : 0;
        const radius = c.flora[FLORA_NAMES[species]].radius * c.foodRadius;
        world.floraDisc.localOnly = true;
        world.floraDisc.cx = world.zoneX[dungZone];
        world.floraDisc.cy = world.zoneY[dungZone];
        world.floraDisc.discRadius = c.fertileZoneRadius;
        if (placeInDisc(world, world.floraDisc, radius)) {
            const item = writeItem(world, slot, species, -1);
            world.foodOrigin[item] = FOOD_ORIGIN.DUNG_ZONE;
            return item;
        }
    }
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
