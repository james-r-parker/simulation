// Carries pollen between living source identities and seeds local plant descendants.
import { FLORA_NAMES } from './config-flora.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { placeSeed } from './flora-placement.js';
import { blendTraits, copyTraits, mutateTraits } from './flora-traits.js';
import { nextFloat } from './rng.js';

/** Reasons attached to a refused seed attempt. */
export const SEED_REFUSED = Object.freeze({ POOL: 0, COOLDOWN: 1, NEAR: 2 });
export const SEED_SOURCE = Object.freeze({ POLLEN: 0, HERD: 1 });

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
 * @param {{patch:number,reason:number,source:number,slot?:number}} refusal context
 * @returns {void}
 */
export function reportSeedingRefused(world, { patch, reason, source, slot = -1 }) {
    const stamp = world.tick + 1;
    if (source === SEED_SOURCE.POLLEN) {
        if (world.pollenRefusalTick[slot] === stamp) {
            return;
        }
        world.pollenRefusalTick[slot] = stamp;
    }
    const at = pushEvent(world.events, EVENT_TYPE.SEEDING_REFUSED, world.tick);
    world.events.data[at + 2] = world.patchSpecies[patch];
    world.events.data[at + 3] = reason;
    world.events.data[at + 4] = source;
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
 * Plants a seedling from a source patch, optionally blending a second pollen parent first.
 * @param {import('./world.js').World} world the world
 * @param {{x:number,y:number,parent:number,otherParent?:number}} seedling location and source patches
 * @returns {number} the new patch slot or -1 when the pool has no free slot
 */
export function plantSeedling(world, { x, y, parent, otherParent }) {
    const patch = freePatch(world);
    if (patch < 0) {
        return -1;
    }
    const species = world.patchSpecies[parent];
    const row = world.config.flora[FLORA_NAMES[species]];
    world.patchSpecies[patch] = species;
    world.patchAlive[patch] = 1;
    world.patchSerial[patch]++;
    world.patchLowTicks[patch] = 0;
    world.patchX[patch] = x;
    world.patchY[patch] = y;
    world.patchStock[patch] = world.config.seedStock * world.config.foodPatchCapacity;
    world.patchSeedTick[patch] = world.tick - world.config.seedCooldownTicks;
    world.patchYield[patch] = row.yield;
    world.patchSpan[patch] = row.span;
    world.patchWeight[patch] = 0;
    if (otherParent === undefined) {
        copyTraits(world, parent);
    } else {
        blendTraits(world, otherParent, parent);
    }
    mutateTraits(world, patch);
    return patch;
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
        reportSeedingRefused(world, {
            patch: parentB,
            reason: SEED_REFUSED.COOLDOWN,
            source: SEED_SOURCE.POLLEN,
            slot,
        });
        return -1;
    }
    world.patchSeedTick[parentB] = world.tick;
    clearPollen(world, slot);
    const patch = freePatch(world);
    if (patch < 0) {
        reportSeedingRefused(world, { patch: parentB, reason: SEED_REFUSED.POOL, source: SEED_SOURCE.POLLEN, slot });
        return -1;
    }
    if (!placeSeed(world, parentB)) {
        reportSeedingRefused(world, { patch: parentB, reason: SEED_REFUSED.NEAR, source: SEED_SOURCE.POLLEN, slot });
        return -1;
    }
    const seedling = plantSeedling(world, {
        x: world.point[0],
        y: world.point[1],
        parent: parentB,
        otherParent: parentA,
    });
    if (seedling < 0) {
        reportSeedingRefused(world, { patch: parentB, reason: SEED_REFUSED.POOL, source: SEED_SOURCE.POLLEN, slot });
        return -1;
    }
    const species = world.patchSpecies[parentB];
    const at = pushEvent(world.events, EVENT_TYPE.PATCH_SEEDED, world.tick);
    world.events.data[at + 2] = species;
    world.events.data[at + 3] = seedling;
    world.events.data[at + 4] = parentA;
    world.events.data[at + 5] = parentB;
    world.events.data[at + 6] = world.patchHue[seedling];
    world.events.data[at + 7] = world.patchX[seedling];
    world.events.data[at + 8] = world.patchY[seedling];
    return seedling;
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
