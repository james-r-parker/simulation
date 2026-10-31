// Allocates and checks the patch and item trait records for flora.
import { MYCELIUM_ARRAYS } from './mycelium.js';
import { FLORA_NAMES } from './config-flora.js';

/** Flora fields included in every world checkpoint. */
export const FLORA_ARRAYS = [
    'patchAlive',
    'patchSerial',
    'patchLowTicks',
    'patchBank',
    'patchSeedTick',
    'patchSpecies',
    'patchHue',
    'patchEnergy',
    'patchRegrow',
    'patchLife',
    'patchStart',
    'patchSpan',
    'patchYield',
    'patchWeight',
    'foodSpecies',
    'foodHue',
    'foodTox',
    'foodLife',
    'foodPatch',
    'foodPatchSerial',
];

const PATCH_POSITIVE = ['patchEnergy', 'patchLife', 'patchSpan'];
const PATCH_NONNEGATIVE = ['patchRegrow', 'patchYield', 'patchWeight', 'patchStock'];
const PATCH_COUNTERS = [
    ['patchBank', 'seedBankTicks'],
    ['patchLowTicks', 'patchDieTicks'],
];

const PATCH_FIELDS = ['Hue', 'Energy', 'Regrow', 'Life', 'Start', 'Span', 'Yield', 'Weight'];

/**
 * @param {import('./world.js').World} world the allocated world
 * @returns {void}
 */
export function allocateFlora(world) {
    const { floraPatchMax, maxFood, myceliumMax } = world.config;
    world.floraDisc = { cx: 0, cy: 0, discRadius: 0, localOnly: false };
    world.floraIntake = new Float64Array(24);
    world.floraMeals = new Float64Array(2);
    world.floraTraits = new Float64Array(5);
    for (const name of MYCELIUM_ARRAYS) {
        world[name] = name === 'myceliumTicks' ? new Int32Array(myceliumMax) : new Float32Array(myceliumMax);
    }
    world.patchAlive = new Uint8Array(floraPatchMax);
    world.patchSerial = new Uint32Array(floraPatchMax);
    world.patchLowTicks = new Int32Array(floraPatchMax);
    world.patchBank = new Int32Array(floraPatchMax);
    world.patchSeedTick = new Float64Array(floraPatchMax).fill(-world.config.seedCooldownTicks);
    world.patchSpecies = new Uint8Array(floraPatchMax);
    for (const field of PATCH_FIELDS) {
        world[`patch${field}`] = new Float32Array(floraPatchMax);
    }
    for (const name of ['foodSpecies', 'foodHue', 'foodTox', 'foodLife', 'foodPatch', 'foodPatchSerial']) {
        const Type = name === 'foodPatchSerial' ? Uint32Array : name === 'foodPatch' ? Int32Array : Float32Array;
        world[name] = new Type(maxFood);
        world.foodRows.push({ array: world[name], stride: 1 });
    }
}

/**
 * Assigns the initial patch mix by largest remainder, with species order breaking ties.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function assignFlora(world) {
    const rows = FLORA_NAMES.map((name) => world.config.flora[name]);
    const total = rows.reduce((sum, row) => sum + row.share, 0);
    if (total === 0 && world.config.foodPatchCount > 0) {
        throw new Error('flora: patches need a species with positive share');
    }
    const exact = rows.map((row) => (total > 0 ? (row.share / total) * world.config.foodPatchCount : 0));
    const counts = exact.map(Math.floor);
    const order = exact.map((value, i) => i).sort((a, b) => exact[b] - counts[b] - (exact[a] - counts[a]) || a - b);
    const remaining = world.config.foodPatchCount - counts.reduce((sum, n) => sum + n, 0);
    for (let i = 0; i < remaining; i++) {
        counts[order[i]]++;
    }
    let patch = 0;
    for (let species = 0; species < rows.length; species++) {
        const row = rows[species];
        for (let n = 0; n < counts[species]; n++) {
            world.patchSpecies[patch] = species;
            for (const field of PATCH_FIELDS.slice(0, -1)) {
                world[`patch${field}`][patch] = row[field.toLowerCase()];
            }
            if (world.patchStart[patch] >= 1) {
                world.patchStart[patch] = 0;
            }
            patch++;
        }
    }
}

/**
 * Checks flora state for a checkpoint or debug tick.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function assertFlora(world) {
    for (const name of FLORA_ARRAYS) {
        for (const value of world[name]) {
            if (!Number.isFinite(value)) {
                throw new Error(`flora invariant: ${name} must be finite`);
            }
        }
    }
    for (let i = 0; i < world.patchSpecies.length; i++) {
        assertPatchState(world, i);
        if (!validSpecies(world.patchSpecies[i]) || Math.abs(world.patchHue[i]) > 1) {
            throw new Error('flora invariant: invalid patch species or hue');
        }
    }
    for (let i = 0; i < world.foodAlive.length; i++) {
        if (world.foodAlive[i] === 1) {
            assertItem(world, i);
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch patch slot
 * @returns {void}
 */
function assertPatchState(world, patch) {
    const alive = world.patchAlive[patch];
    const bank = world.patchBank[patch];
    assertPatchCounters(world, patch);
    if (alive > 1) {
        throw new Error('flora invariant: invalid patch state');
    }
    if (alive === 1 && (bank !== 0 || world.patchSerial[patch] === 0)) {
        throw new Error('flora invariant: live patch holds a bank or no serial');
    }
    if (alive === 0 && (world.patchStock[patch] !== 0 || world.patchWeight[patch] !== 0)) {
        throw new Error('flora invariant: dead patch holds stock or weight');
    }
    if (alive === 1 || bank > 0) {
        assertPatchTraits(world, patch);
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch patch slot
 * @returns {void}
 */
function assertPatchCounters(world, patch) {
    for (const [field, limit] of PATCH_COUNTERS) {
        if (world[field][patch] < 0 || world[field][patch] > world.config[limit]) {
            throw new Error('flora invariant: invalid patch timer');
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} patch occupied patch slot
 * @returns {void}
 */
function assertPatchTraits(world, patch) {
    for (const field of PATCH_POSITIVE) {
        if (!(world[field][patch] > 0)) {
            throw new Error(`flora invariant: invalid ${field}`);
        }
    }
    for (const field of PATCH_NONNEGATIVE) {
        if (world[field][patch] < 0) {
            throw new Error(`flora invariant: invalid ${field}`);
        }
    }
    if (world.patchStart[patch] < 0 || world.patchStart[patch] >= 1 || world.patchSpan[patch] > 1) {
        throw new Error('flora invariant: invalid patch fruiting range');
    }
    if (world.patchStock[patch] > world.config.foodPatchCapacity) {
        throw new Error('flora invariant: patch stock exceeds capacity');
    }
}

/**
 * @param {number} species species id
 * @returns {boolean} whether it is a valid table index
 */
function validSpecies(species) {
    return Number.isInteger(species) && species >= 0 && species < FLORA_NAMES.length;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} i live food slot
 * @returns {void}
 */
function assertItem(world, i) {
    const patch = world.foodPatch[i];
    if (!validSpecies(world.foodSpecies[i])) {
        throw new Error('flora invariant: invalid foodSpecies');
    }
    if (!(world.foodLife[i] > 0)) {
        throw new Error('flora invariant: invalid foodLife');
    }
    if (Math.abs(world.foodHue[i]) > 1) {
        throw new Error('flora invariant: invalid foodHue');
    }
    if (!(patch >= -1 && patch < world.patchSpecies.length)) {
        throw new Error('flora invariant: invalid foodPatch');
    }
    if (patch >= 0 ? world.foodPatchSerial[i] === 0 : world.foodPatchSerial[i] !== 0) {
        throw new Error('flora invariant: invalid foodPatchSerial');
    }
    if (!(world.foodTox[i] >= 0 && world.foodTox[i] <= 1)) {
        throw new Error('flora invariant: invalid foodTox');
    }
}
