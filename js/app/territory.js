// The per-lineage occupancy grid behind the territory lens: where each of the top lineages has been, as a slowly
// fading weight per cell. `accumulateTerritory` adds each snapshot's agents, `territoryPixels` turns the weights into
// RGBA texels (the heaviest lineage's colour, more opaque where it has been longer). Pure; the layer owns the texture.

import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from './interpolate.js';
import { FAMILY_SLOTS } from './family-slots.js';
import { FAMILY_PALETTES } from './renderer/colors.js';

/** Grid columns. */
export const TERRITORY_COLUMNS = 128;
/** Planes: one per family colour slot. */
export const TERRITORY_LINEAGES = FAMILY_SLOTS;
/** Every this many snapshots all weights fade. */
export const FADE_EVERY = 16;
/** The factor they fade by. */
export const FADE_FACTOR = 0.97;
/** The most opaque a cell gets, and the weight at which it gets there divided by that opacity. */
export const MAX_ALPHA = 0.5;
export const WEIGHT_PER_ALPHA = 12;

/**
 * @typedef {object} Territory
 * @property {number} cols grid columns
 * @property {number} rows grid rows, from the world's aspect ratio
 * @property {number} worldWidth the world width
 * @property {number} worldHeight the world height
 * @property {Int32Array} slots the lineage id each weight plane belongs to (a plane is a family colour slot), -1 for a
 *   free plane
 * @property {Float32Array} weights `TERRITORY_LINEAGES` planes of `cols x rows`
 * @property {number} snapshots snapshots accumulated, for the fade
 */

/**
 * @param {{worldWidth: number, worldHeight: number, cols?: number}} world the world size and, for tests, the columns
 * @returns {Territory} an empty grid
 */
export function createTerritory({ worldWidth, worldHeight, cols = TERRITORY_COLUMNS }) {
    const rows = Math.max(1, Math.round((cols * worldHeight) / worldWidth));
    return {
        cols,
        rows,
        worldWidth,
        worldHeight,
        slots: new Int32Array(TERRITORY_LINEAGES).fill(-1),
        weights: new Float32Array(TERRITORY_LINEAGES * cols * rows),
        snapshots: 0,
    };
}

/**
 * Follows the family slots: a plane whose slot now holds another family is emptied, so a family never inherits the
 * history of the one that held its slot before.
 * @param {Territory} t the grid
 * @param {import('./family-slots.js').FamilySlots} family the family slots
 * @returns {void}
 */
export function syncSlots(t, family) {
    const plane = t.cols * t.rows;
    for (let s = 0; s < TERRITORY_LINEAGES; s++) {
        if (t.slots[s] !== family.ids[s]) {
            t.slots[s] = family.ids[s];
            t.weights.fill(0, s * plane, (s + 1) * plane);
        }
    }
}

/**
 * Adds one to the cell under every agent of a tracked lineage, and every `FADE_EVERY` snapshots fades all weights.
 * @param {Territory} t the grid
 * @param {{u32: Uint32Array, f32: Float32Array}} snapshot the snapshot
 * @returns {void}
 */
export function accumulateTerritory(t, { u32, f32 }) {
    const plane = t.cols * t.rows;
    for (let i = 0; i < u32[1]; i++) {
        const at = HEADER_WORDS + i * AGENT_STRIDE;
        const slot = t.slots.indexOf(u32[at + AGENT_FIELD.LINEAGE]);
        if (slot >= 0) {
            const cx = Math.min(Math.max(Math.floor((f32[at + AGENT_FIELD.X] / t.worldWidth) * t.cols), 0), t.cols - 1);
            const cy = Math.min(
                Math.max(Math.floor((f32[at + AGENT_FIELD.Y] / t.worldHeight) * t.rows), 0),
                t.rows - 1,
            );
            t.weights[slot * plane + cy * t.cols + cx] += 1;
        }
    }
    t.snapshots += 1;
    if (t.snapshots % FADE_EVERY === 0) {
        for (let i = 0; i < t.weights.length; i++) {
            t.weights[i] *= FADE_FACTOR;
        }
    }
}

/**
 * Writes the texels: each cell takes the colour of the lineage with the most weight there, at an alpha of
 * `min(MAX_ALPHA, weight / WEIGHT_PER_ALPHA)`; an empty cell is transparent.
 * @param {Territory} t the grid
 * @param {{out: Uint8Array, palette: string}} target `out` is `cols x rows x 4` bytes, rewritten (row 0 is y = 0);
 *   `palette` names the family palette whose slot colours are written
 * @returns {void}
 */
export function territoryPixels(t, { out, palette }) {
    const plane = t.cols * t.rows;
    const colors = FAMILY_PALETTES[palette];
    for (let cell = 0; cell < plane; cell++) {
        let best = 0;
        let weight = 0;
        for (let s = 0; s < TERRITORY_LINEAGES; s++) {
            if (t.weights[s * plane + cell] > weight) {
                weight = t.weights[s * plane + cell];
                best = s;
            }
        }
        const o = cell * 4;
        out[o] = Math.round(Math.min(colors[best][0], 1) * 255);
        out[o + 1] = Math.round(Math.min(colors[best][1], 1) * 255);
        out[o + 2] = Math.round(Math.min(colors[best][2], 1) * 255);
        out[o + 3] = Math.round(Math.min(MAX_ALPHA, weight / WEIGHT_PER_ALPHA) * 255);
    }
}
