// Adds capped dung fertility zones on a seed-derived interval for each live herd animal.

import { fertileZoneSlot, writeFertileZone, ZONE_ORIGIN } from './environment.js';
import { FLORA_NAMES } from './config-flora.js';
import { FOOD_KIND } from './carcass.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { plantSeedling, reportSeedingRefused, SEED_REFUSED, SEED_SOURCE } from './pollination.js';
import { nextFloat } from './rng.js';

/** @typedef {import('./world.js').World} World */

/** @param {World} world @returns {number} the oldest live dung zone, or -1 */
function oldestDungZone(world) {
    let oldest = -1;
    for (let slot = 0; slot < world.zoneAlive.length; slot++) {
        if (world.zoneAlive[slot] !== 1 || world.zoneOrigin[slot] !== ZONE_ORIGIN.DUNG) {
            continue;
        }
        if (
            oldest < 0 ||
            world.zoneFertility[slot] / world.zoneInitial[slot] <
                world.zoneFertility[oldest] / world.zoneInitial[oldest]
        ) {
            oldest = slot;
        }
    }
    return oldest;
}

/**
 * Adds a dung zone, replacing the oldest dung at its cap and otherwise using the normal oldest-zone slot policy.
 * @param {World} world the world
 * @param {number} x zone centre x
 * @param {number} y zone centre y
 * @returns {number} the slot used, or -1 when dung zones are disabled or there are no zone slots
 */
export function addDungZone(world, x, y) {
    const cap = world.config.herdDungZoneMax;
    if (cap === 0) {
        return -1;
    }
    let dungCount = 0;
    for (let slot = 0; slot < world.zoneAlive.length; slot++) {
        if (world.zoneAlive[slot] === 1 && world.zoneOrigin[slot] === ZONE_ORIGIN.DUNG) {
            dungCount++;
        }
    }
    const slot = dungCount >= cap ? oldestDungZone(world) : fertileZoneSlot(world);
    return writeFertileZone(world, {
        slot,
        x,
        y,
        size: world.config.herdDungSize,
        origin: ZONE_ORIGIN.DUNG,
    });
}

/** @param {World} world @param {number} food @returns {number} a matching living source patch or -1 */
function seedSourcePatch(world, food) {
    const patch = world.foodPatch[food];
    if (
        world.foodAlive[food] !== 1 ||
        world.foodKind[food] !== FOOD_KIND.PLANT ||
        patch < 0 ||
        patch >= world.patchAlive.length ||
        world.patchAlive[patch] !== 1 ||
        world.foodPatchSerial[food] !== world.patchSerial[patch] ||
        world.foodSpecies[food] !== world.patchSpecies[patch]
    ) {
        return -1;
    }
    return patch;
}

/**
 * Drops dung on each elapsed interval while the animal has a store above half its maximum.
 * Uses age as the interval clock, so the rule needs no extra state or random draws.
 * @param {World} world the world
 * @returns {void}
 */
export function dropHerdDung(world) {
    const { herdDungTicks, herdStoreMax } = world.config;
    if (world.config.herdDungZoneMax === 0) {
        return;
    }
    for (let animal = 0; animal < world.herdAlive.length; animal++) {
        if (
            world.herdAlive[animal] === 1 &&
            world.herdStore[animal] > herdStoreMax / 2 &&
            (world.herdAge[animal] + 1) % herdDungTicks === 0
        ) {
            const x = world.herdX[animal];
            const y = world.herdY[animal];
            if (addDungZone(world, x, y) >= 0) {
                releaseHerdSeed(world, animal, x, y);
            }
        }
    }
}

/** Clears an animal's carried seed identity and lifetime. @param {World} world @param {number} animal @returns {void} */
function clearHerdSeed(world, animal) {
    world.herdSeedPatch[animal] = 0;
    world.herdSeedSerial[animal] = 0;
    world.herdSeedTicks[animal] = 0;
}

/** @param {World} world @param {number} animal @returns {number} a valid source patch or -1 */
function validHerdSeed(world, animal) {
    const patch = world.herdSeedPatch[animal] - 1;
    return world.herdSeedPatch[animal] > 0 &&
        world.herdSeedTicks[animal] > 0 &&
        patch >= 0 &&
        patch < world.patchAlive.length &&
        world.patchAlive[patch] === 1 &&
        world.herdSeedSerial[animal] === world.patchSerial[patch]
        ? patch
        : -1;
}

/** Loads a seed identity from a grazed item of a living pollinated patch. @param {World} world @param {number} animal @param {number} food @returns {void} */
export function loadHerdSeed(world, animal, food) {
    const patch = seedSourcePatch(world, food);
    if (world.config.herdSeedChance === 0 || patch < 0) {
        return;
    }
    const row = world.config.flora[FLORA_NAMES[world.patchSpecies[patch]]];
    if (row.pollenChance === 0 || nextFloat(world.rng.herds) >= world.config.herdSeedChance) {
        return;
    }
    world.herdSeedPatch[animal] = patch + 1;
    world.herdSeedSerial[animal] = world.patchSerial[patch];
    world.herdSeedTicks[animal] = world.config.herdSeedTicks;
}

/** Ages carried seeds and clears expired or stale source identities. @param {World} world @returns {void} */
export function ageHerdSeeds(world) {
    for (let animal = 0; animal < world.herdAlive.length; animal++) {
        if (world.herdSeedPatch[animal] === 0) {
            continue;
        }
        if (world.herdAlive[animal] !== 1 || validHerdSeed(world, animal) < 0 || world.herdSeedTicks[animal] <= 1) {
            clearHerdSeed(world, animal);
        } else {
            world.herdSeedTicks[animal]--;
        }
    }
}

/** @param {World} world @param {number} parent @param {number} x @param {number} y @returns {boolean} */
function nearAnyPatch(world, parent, x, y) {
    const radiusSq = world.config.foodPatchRadius * world.config.foodPatchRadius;
    for (let patch = 0; patch < world.patchAlive.length; patch++) {
        if (world.patchAlive[patch] !== 1 || patch === parent) {
            continue;
        }
        const dx = x - world.patchX[patch];
        const dy = y - world.patchY[patch];
        if (dx * dx + dy * dy <= radiusSq) {
            return true;
        }
    }
    return false;
}

/** Attempts to plant a carried seed on a dung drop. @param {World} world @param {number} animal @param {number} x @param {number} y @returns {void} */
function releaseHerdSeed(world, animal, x, y) {
    const parent = validHerdSeed(world, animal);
    if (parent < 0) {
        clearHerdSeed(world, animal);
        return;
    }
    if (world.tick - world.patchSeedTick[parent] < world.config.seedCooldownTicks) {
        reportSeedingRefused(world, { patch: parent, reason: SEED_REFUSED.COOLDOWN, source: SEED_SOURCE.HERD });
        return;
    }
    world.patchSeedTick[parent] = world.tick;
    clearHerdSeed(world, animal);
    const dx = x - world.patchX[parent];
    const dy = y - world.patchY[parent];
    const minDistanceSq = world.config.herdSeedMinDistance * world.config.herdSeedMinDistance;
    if (dx * dx + dy * dy < minDistanceSq || nearAnyPatch(world, parent, x, y)) {
        reportSeedingRefused(world, { patch: parent, reason: SEED_REFUSED.NEAR, source: SEED_SOURCE.HERD });
        return;
    }
    const seedling = plantSeedling(world, { x, y, parent });
    if (seedling < 0) {
        reportSeedingRefused(world, { patch: parent, reason: SEED_REFUSED.POOL, source: SEED_SOURCE.HERD });
        return;
    }
    const at = pushEvent(world.events, EVENT_TYPE.HERD_SEEDED, world.tick);
    world.events.data[at + 2] = world.herdGroup[animal];
    world.events.data[at + 3] = animal;
    world.events.data[at + 4] = parent;
    world.events.data[at + 5] = seedling;
    world.events.data[at + 6] = world.patchSpecies[seedling];
    world.events.data[at + 7] = x;
    world.events.data[at + 8] = y;
}
