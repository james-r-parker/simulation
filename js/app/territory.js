// The per-lineage occupancy grid behind the territory lens: where each of the top lineages has been, as a slowly
// fading weight per cell. `accumulateTerritory` adds each snapshot's agents, `territoryPixels` turns the weights into
// RGBA texels (the heaviest lineage's colour, more opaque where it has been longer). Pure; the layer owns the texture.

import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from './interpolate.js';
import { lineageColor } from './renderer/colors.js';

/** Grid columns. */
export const TERRITORY_COLUMNS = 128;
/** Lineages tracked. */
export const TERRITORY_LINEAGES = 8;
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
 * @property {Int32Array} slots the lineage id each weight plane belongs to, -1 for a free plane
 * @property {Float32Array} weights `TERRITORY_LINEAGES` planes of `cols x rows`
 * @property {number} snapshots snapshots accumulated, for the fade
 * @property {Float32Array} colors linear RGB for each plane, rewritten by `territoryPixels`
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
        colors: new Float32Array(TERRITORY_LINEAGES * 3),
    };
}

/**
 * @param {{ids: Uint32Array, count: number}} top the lineages wanted
 * @param {number} id a lineage id
 * @returns {boolean} whether it is one of them
 */
function isWanted(top, id) {
    for (let i = 0; i < top.count; i++) {
        if (top.ids[i] === id) {
            return true;
        }
    }
    return false;
}

/**
 * @param {Territory} t the grid
 * @param {{ids: Uint32Array, count: number}} top the lineages wanted
 * @returns {number} a plane that is unused or holds a lineage no longer wanted, -1 when there is none
 */
function freePlane(t, top) {
    for (let s = 0; s < t.slots.length; s++) {
        if (t.slots[s] < 0 || !isWanted(top, t.slots[s])) {
            return s;
        }
    }
    return -1;
}

/**
 * Gives each of the current top lineages a weight plane: one that already has a plane keeps it, a new one takes a
 * plane no longer wanted (zeroed).
 * @param {Territory} t the grid
 * @param {{ids: Uint32Array, count: number}} top the top lineages' ids
 * @returns {void}
 */
export function assignLineages(t, top) {
    const plane = t.cols * t.rows;
    for (let i = 0; i < top.count; i++) {
        if (t.slots.indexOf(top.ids[i]) < 0) {
            const free = freePlane(t, top);
            if (free >= 0) {
                t.slots[free] = top.ids[i];
                t.weights.fill(0, free * plane, (free + 1) * plane);
            }
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
 * @param {Uint8Array} out `cols x rows x 4` bytes, rewritten; row 0 is y = 0
 * @returns {void}
 */
export function territoryPixels(t, out) {
    const plane = t.cols * t.rows;
    for (let s = 0; s < TERRITORY_LINEAGES; s++) {
        lineageColor(Math.max(t.slots[s], 0), 0.5, /** @type {any} */ (t.colors.subarray(s * 3, s * 3 + 3)));
    }
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
        out[o] = Math.round(Math.min(t.colors[best * 3], 1) * 255);
        out[o + 1] = Math.round(Math.min(t.colors[best * 3 + 1], 1) * 255);
        out[o + 2] = Math.round(Math.min(t.colors[best * 3 + 2], 1) * 255);
        out[o + 3] = Math.round(Math.min(MAX_ALPHA, weight / WEIGHT_PER_ALPHA) * 255);
    }
}
