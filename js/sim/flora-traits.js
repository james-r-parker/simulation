// Blends and mutates inherited patch traits within their archetype's bounds.
import { FLORA_NAMES } from './config-flora.js';
import { nextGaussian } from './rng.js';

const FIELDS = ['patchEnergy', 'patchRegrow', 'patchLife', 'patchHue', 'patchStart'];
const KEYS = ['energy', 'regrow', 'life', 'hue', 'start'];
const HUE = 3;
const START = 4;

/**
 * @param {number} value year phase
 * @param {number} base archetype phase
 * @returns {number} signed phase offset about the archetype
 */
function offset(value, base) {
    const delta = value - base;
    return delta - Math.floor(delta + 0.5);
}

/**
 * Writes double-precision means to reusable floraTraits scratch; mutateTraits consumes them next.
 * @param {import('./world.js').World} world the world
 * @param {number} parentA first patch
 * @param {number} parentB second patch of the same species
 * @returns {void}
 */
export function blendTraits(world, parentA, parentB) {
    const row = world.config.flora[FLORA_NAMES[world.patchSpecies[parentA]]];
    for (let i = 0; i < FIELDS.length; i++) {
        const a = world[FIELDS[i]][parentA];
        const b = world[FIELDS[i]][parentB];
        world.floraTraits[i] = i === START ? (offset(a, row.start) + offset(b, row.start)) / 2 : (a + b) / 2;
    }
}

/** Writes one parent's archetype-relative traits to reusable mutation scratch. @param {import('./world.js').World} world @param {number} parent @returns {void} */
export function copyTraits(world, parent) {
    const row = world.config.flora[FLORA_NAMES[world.patchSpecies[parent]]];
    for (let i = 0; i < FIELDS.length; i++) {
        const value = world[FIELDS[i]][parent];
        world.floraTraits[i] = i === START ? offset(value, row.start) : value;
    }
}

/**
 * @param {Record<string, number>} row archetype
 * @param {number} trait index in FIELDS
 * @returns {number} archetype-relative mutation width
 */
function width(row, trait) {
    if (trait === HUE) {
        return row.range;
    }
    return trait === START ? 0.25 * row.range : row[KEYS[trait]] * row.range;
}

/**
 * Consumes one Gaussian per trait, even with mutation or width zero, and writes a seedling's five traits.
 * @param {import('./world.js').World} world the world with means in floraTraits
 * @param {number} patch target patch, with its species already assigned
 * @returns {void}
 */
export function mutateTraits(world, patch) {
    const row = world.config.flora[FLORA_NAMES[world.patchSpecies[patch]]];
    for (let i = 0; i < FIELDS.length; i++) {
        const w = width(row, i);
        const base = i === START ? 0 : row[KEYS[i]];
        const value = world.floraTraits[i] + nextGaussian(world.rng.flora) * world.config.floraMutation * w;
        let trait = Math.max(base - w, Math.min(base + w, value));
        if (i === HUE) {
            trait = Math.max(-1, Math.min(1, trait));
        }
        if (i === START) {
            const phase = row.start + trait;
            trait = Math.fround(phase - Math.floor(phase));
            trait = trait >= 1 ? 0 : trait;
        }
        world[FIELDS[i]][patch] = trait;
    }
}
