// Allocates and checks the patch and item trait records for flora.
import { FLORA_NAMES } from './config-flora.js';

/** Flora fields included in every world checkpoint. */
export const FLORA_ARRAYS = [
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
];

const PATCH_FIELDS = ['Hue', 'Energy', 'Regrow', 'Life', 'Start', 'Span', 'Yield', 'Weight'];

/**
 * @param {import('./world.js').World} world the allocated world
 * @returns {void}
 */
export function allocateFlora(world) {
    const { foodPatchCount, maxFood, myceliumMax } = world.config;
    world.floraDisc = { cx: 0, cy: 0, discRadius: 0, localOnly: false };
    world.floraIntake = new Float64Array(24);
    world.patchSpecies = new Uint8Array(foodPatchCount);
    for (const field of PATCH_FIELDS) {
        world[`patch${field}`] = new Float32Array(foodPatchCount);
    }
    for (const name of ['foodSpecies', 'foodHue', 'foodTox', 'foodLife', 'foodPatch']) {
        const Type = name === 'foodPatch' ? Int32Array : Float32Array;
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
    if (!(world.foodTox[i] >= 0 && world.foodTox[i] <= 1)) {
        throw new Error('flora invariant: invalid foodTox');
    }
}
