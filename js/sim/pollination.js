// Carries pollen between living source identities and seeds local plant descendants.
import { FLORA_NAMES } from './config-flora.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { placeSeed } from './flora-placement.js';
import { blendTraits, mutateTraits } from './flora-traits.js';
import { nextFloat } from './rng.js';

/** Reasons attached to a refused seed attempt. */
export const SEED_REFUSED = Object.freeze({ POOL: 0, COOLDOWN: 1, PLACEMENT: 2 });

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot carrier
 * @returns {void}
 */
function clearPollen(world, slot) {
    world.pollenPatch[slot] = 0;
    world.pollenSerial[slot] = 0;
    world.pollenTicks[slot] = 0;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot carrier
 * @returns {boolean} whether its pollen source still exists
 */
function validPollen(world, slot) {
    const patch = world.pollenPatch[slot] - 1;
    return (
        world.pollenPatch[slot] !== 0 &&
        world.pollenTicks[slot] > 0 &&
        world.patchAlive[patch] === 1 &&
        world.pollenSerial[slot] === world.patchSerial[patch]
    );
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} food eaten item
 * @returns {number} a living matching source, or -1 for stale/background items
 */
function sourcePatch(world, food) {
    const patch = world.foodPatch[food];
    return patch >= 0 &&
        world.patchAlive[patch] === 1 &&
        world.foodPatchSerial[food] === world.patchSerial[patch] &&
        world.foodSpecies[food] === world.patchSpecies[patch]
        ? patch
        : -1;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot carrier
 * @param {number} patch visited patch
 * @param {number} reason refusal code
 * @returns {void}
 */
function refuse(world, slot, patch, reason) {
    const stamp = world.tick + 1;
    if (world.pollenRefusalTick[slot] === stamp) {
        return;
    }
    world.pollenRefusalTick[slot] = stamp;
    const at = pushEvent(world.events, EVENT_TYPE.SEEDING_REFUSED, world.tick);
    world.events.data[at + 2] = world.patchSpecies[patch];
    world.events.data[at + 3] = reason;
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {number} first empty slot with no surviving bank
 */
function freePatch(world) {
    for (let patch = 0; patch < world.patchAlive.length; patch++) {
        if (world.patchAlive[patch] === 0 && world.patchBank[patch] === 0) {
            return patch;
        }
    }
    return -1;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch free slot
 * @param {number} parentA pollen source
 * @param {number} parentB visited patch
 * @returns {void}
 */
function writeSeed(world, patch, parentA, parentB) {
    const species = world.patchSpecies[parentB];
    const row = world.config.flora[FLORA_NAMES[species]];
    world.patchSpecies[patch] = species;
    world.patchAlive[patch] = 1;
    world.patchSerial[patch]++;
    world.patchLowTicks[patch] = 0;
    world.patchX[patch] = world.point[0];
    world.patchY[patch] = world.point[1];
    world.patchStock[patch] = world.config.seedStock * world.config.foodPatchCapacity;
    world.patchYield[patch] = row.yield;
    world.patchSpan[patch] = row.span;
    world.patchWeight[patch] = 0;
    world.patchSeedTick[patch] = world.tick - world.config.seedCooldownTicks;
    blendTraits(world, parentA, parentB);
    mutateTraits(world, patch);
    const at = pushEvent(world.events, EVENT_TYPE.PATCH_SEEDED, world.tick);
    world.events.data[at + 2] = species;
    world.events.data[at + 3] = patch;
    world.events.data[at + 4] = parentA;
    world.events.data[at + 5] = parentB;
    world.events.data[at + 6] = world.patchHue[patch];
    world.events.data[at + 7] = world.patchX[patch];
    world.events.data[at + 8] = world.patchY[patch];
}

/**
 * Seeds from two living same-species parents. Cooldown retains pollen; other outcomes consume it and stamp the visit.
 * @param {import('./world.js').World} world the world
 * @param {number} slot carrier
 * @param {number} parentA pollen source
 * @param {number} parentB visited patch
 * @returns {number} new patch, or -1 for a refused attempt
 */
export function seedPatch(world, slot, parentA, parentB) {
    if (world.tick - world.patchSeedTick[parentB] < world.config.seedCooldownTicks) {
        refuse(world, slot, parentB, SEED_REFUSED.COOLDOWN);
        return -1;
    }
    world.patchSeedTick[parentB] = world.tick;
    clearPollen(world, slot);
    const patch = freePatch(world);
    if (patch < 0) {
        refuse(world, slot, parentB, SEED_REFUSED.POOL);
        return -1;
    }
    if (!placeSeed(world, parentB)) {
        refuse(world, slot, parentB, SEED_REFUSED.PLACEMENT);
        return -1;
    }
    writeSeed(world, patch, parentA, parentB);
    return patch;
}

/**
 * Loads or delivers pollen before an eaten plant item is cleared.
 * @param {import('./world.js').World} world the world
 * @param {number} slot eating agent
 * @param {number} food eaten plant item
 * @returns {void}
 */
export function carryPollen(world, slot, food) {
    const patch = sourcePatch(world, food);
    if (patch < 0) {
        return;
    }
    const row = world.config.flora[FLORA_NAMES[world.patchSpecies[patch]]];
    if (row.pollenChance === 0) {
        return;
    }
    if (validPollen(world, slot)) {
        const parent = world.pollenPatch[slot] - 1;
        if (parent !== patch && world.patchSpecies[parent] === world.patchSpecies[patch]) {
            seedPatch(world, slot, parent, patch);
            return;
        }
    }
    if (nextFloat(world.rng.flora) < row.pollenChance) {
        world.pollenPatch[slot] = patch + 1;
        world.pollenSerial[slot] = world.patchSerial[patch];
        world.pollenTicks[slot] = world.config.pollenTicks;
    }
}

/**
 * Ages carried pollen before feeding; a dead/reused source or expiry clears the whole record.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function agePollen(world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.pollenTicks[slot] > 0) {
            world.pollenTicks[slot]--;
            if (!validPollen(world, slot)) {
                clearPollen(world, slot);
            }
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot carrier
 * @returns {boolean} whether its occupied/empty record is complete
 */
function validRecord(world, slot) {
    return world.pollenPatch[slot] === 0
        ? world.pollenSerial[slot] === 0 && world.pollenTicks[slot] === 0
        : world.pollenSerial[slot] > 0 && world.pollenTicks[slot] > 0 && world.alive[slot] === 1;
}

/**
 * Bounds stored carrier records; a newly dead/reused source may remain until the next agePollen.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function assertPollen(world) {
    for (let slot = 0; slot < world.pollenPatch.length; slot++) {
        if (
            world.pollenPatch[slot] > world.config.floraPatchMax ||
            world.pollenTicks[slot] < 0 ||
            world.pollenTicks[slot] > world.config.pollenTicks
        ) {
            throw new Error('flora invariant: invalid pollen bounds');
        }
        if (!validRecord(world, slot)) {
            throw new Error('flora invariant: invalid pollen record');
        }
    }
}
