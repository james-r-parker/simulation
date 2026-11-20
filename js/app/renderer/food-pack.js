// Packs the snapshot's food into one bucket per food model: the six flora species (`FLORA_NAMES` order) and the carcass
// (a negative radius). Each row gets its pose (a seeded turn so neighbours differ), its display colour (the flora hue,
// or meat ageing to rot) and a gentle sway for plants. Pure; nothing allocates after `createFoodPack`.

import { createSections, FOOD_STRIDE, readSections } from '../snapshot-view.js';
import { animFor, carcassFadeOf } from './death-anim.js';
import { isPlaying, MAX_DYING } from './dying.js';
import { floraColor } from './flora-colors.js';
import { FILL_SHARE, NEON, toDisplay } from './palette.js';

const ITEM = 4;
/** Food models: six species, then the carcass. */
export const FOOD_KINDS = 7;
export const CARCASS = 6;
/** The least a food item is drawn across, in device px. */
export const FOOD_MIN_PX = 6;
/** Sway: radians either side, and Hz. */
export const SWAY = 0.08;
export const SWAY_HZ = 0.3;
/** A carcass at age 1 is drawn this share of its size. */
export const CARCASS_SHRINK = 0.7;
/** Steps of the plant colour table over the hue range [-1, 1]; read with linear interpolation. */
const HUE_STEPS = 1024;

/**
 * @param {number} capacity the most food items (`maxFood`)
 * @returns {{buckets: {pose: Float32Array, neon: Float32Array, rig0: Float32Array, count: number}[],
 *   sections: import('../snapshot-view.js').Sections, rgb: number[], hueTable: Float32Array,
 *   carcassBase: Float32Array, carcassFaded: boolean}} the buckets, scratch, the plant colour table, the carcasses'
 *   own colour (before a cross-fade) and whether the last frame faded any in
 */
export function createFoodPack(capacity) {
    const buckets = [];
    for (let k = 0; k < FOOD_KINDS; k++) {
        buckets.push({
            pose: new Float32Array(capacity * ITEM),
            neon: new Float32Array(capacity * ITEM),
            rig0: new Float32Array(capacity * ITEM),
            count: 0,
        });
    }
    return {
        buckets,
        sections: createSections(),
        rgb: [0, 0, 0],
        hueTable: buildHueTable(),
        carcassBase: new Float32Array(capacity * 3),
        carcassFaded: false,
    };
}

/**
 * The display colour of every plant hue, so a frame of up to `maxFood` plants reads a table instead of running
 * `floraColor` and `toDisplay` (three sRGB encodes and an HSL round trip) per item.
 * @returns {Float32Array} `(HUE_STEPS + 1) x 3` display RGB over hue -1 to 1
 */
function buildHueTable() {
    const table = new Float32Array((HUE_STEPS + 1) * 3);
    const rgb = [0, 0, 0];
    for (let k = 0; k <= HUE_STEPS; k++) {
        toDisplay(floraColor(-1 + (2 * k) / HUE_STEPS, rgb), rgb);
        table.set(rgb, k * 3);
    }
    return table;
}

/**
 * @param {Float32Array} table from `buildHueTable`
 * @param {number} hue the plant hue; clamped to -1 to 1, as `floraColor` does
 * @param {number[]} rgb receives the colour
 * @returns {number[]} `rgb`
 */
function plantColor(table, hue, rgb) {
    const at = ((Math.min(Math.max(hue, -1), 1) + 1) / 2) * HUE_STEPS;
    const k = Math.min(Math.floor(at), HUE_STEPS - 1);
    const t = at - k;
    for (let c = 0; c < 3; c++) {
        rgb[c] = table[k * 3 + c] + (table[k * 3 + 3 + c] - table[k * 3 + c]) * t;
    }
    return rgb;
}

/**
 * @param {number} x a position
 * @param {number} y a position
 * @returns {number} a stable pseudo-random value in 0 to 1 for the spot
 */
export function spotHash(x, y) {
    // integer mixing of the spot quantised to 1/16 unit: no trigonometry, which for large arguments cost a third of
    // packFood at 3600 items
    let h = Math.imul(Math.round(x * 16), 0x27d4eb2d) ^ Math.imul(Math.round(y * 16), 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {number[]} rgb receives the colour
 * @param {{kind: number, hue: number, age: number}} food the food's model, hue and age
 * @param {Float32Array} table the plant colour table (`buildHueTable`)
 * @returns {number[] | Float32Array} `rgb`
 */
function foodColor(rgb, { kind, hue, age }, table) {
    if (kind !== CARCASS) {
        return plantColor(table, hue, rgb);
    }
    const a = Math.min(Math.max(age, 0), 1);
    for (let c = 0; c < 3; c++) {
        rgb[c] = NEON.meat[c] + (NEON.rot[c] - NEON.meat[c]) * a;
    }
    return rgb;
}

const FOOD = { kind: 0, hue: 0, age: 0 };

/**
 * @param {{u32: Uint32Array, f32: Float32Array}} snapshot the newest snapshot
 * @param {ReturnType<typeof createFoodPack>} pack the buckets
 * @param {{zoom: number, timeSec: number}} view the zoom (device px per world unit) and wall time
 * @returns {number} the items packed
 */
export function packFood(snapshot, pack, { zoom, timeSec }) {
    for (const bucket of pack.buckets) {
        bucket.count = 0;
    }
    const s = readSections(snapshot.u32, pack.sections);
    const minRadius = FOOD_MIN_PX / 2 / Math.max(zoom, 1e-6);
    for (let i = 0; i < s.foodCount; i++) {
        const w = s.foodStart + i * FOOD_STRIDE;
        const radius = snapshot.f32[w + 2];
        FOOD.kind = radius < 0 ? CARCASS : Math.min(Math.max(Math.round(snapshot.f32[w + 4]), 0), CARCASS - 1);
        FOOD.hue = snapshot.f32[w + 5];
        FOOD.age = snapshot.f32[w + 3];
        const bucket = pack.buckets[FOOD.kind];
        const o = bucket.count * ITEM;
        bucket.count += 1;
        const x = snapshot.f32[w];
        const y = snapshot.f32[w + 1];
        const seed = spotHash(x, y);
        const shrink = FOOD.kind === CARCASS ? 1 - (1 - CARCASS_SHRINK) * FOOD.age : 1;
        bucket.pose[o] = x;
        bucket.pose[o + 1] = y;
        bucket.pose[o + 2] = seed * Math.PI * 2;
        bucket.pose[o + 3] = Math.max(Math.abs(radius) * shrink, minRadius);
        const rgb = foodColor(pack.rgb, FOOD, pack.hueTable);
        bucket.neon[o] = rgb[0];
        bucket.neon[o + 1] = rgb[1];
        bucket.neon[o + 2] = rgb[2];
        bucket.neon[o + 3] = FILL_SHARE.default;
        if (FOOD.kind === CARCASS) {
            pack.carcassBase.set(rgb, (o / ITEM) * 3);
        }
        bucket.rig0[o] = 0;
        bucket.rig0[o + 1] = 0;
        bucket.rig0[o + 2] = FOOD.kind === CARCASS ? 0 : SWAY * Math.sin((timeSec * SWAY_HZ + seed) * Math.PI * 2);
        bucket.rig0[o + 3] = 1;
    }
    return s.foodCount;
}

/**
 * Moves the packed plants' sway to `timeSec` without repacking: the only part of a food row that changes between
 * snapshots. A plant's spot seed is its turn, `pose[2] / 2 pi`; carcasses do not sway.
 * @param {ReturnType<typeof createFoodPack>} pack the buckets `packFood` filled
 * @param {number} timeSec wall time
 * @returns {void}
 */
export function swayFood(pack, timeSec) {
    const base = timeSec * SWAY_HZ * Math.PI * 2;
    for (let k = 0; k < CARCASS; k++) {
        const bucket = pack.buckets[k];
        for (let o = 0; o < bucket.count * ITEM; o += ITEM) {
            bucket.rig0[o + 2] = SWAY * Math.sin(base + bucket.pose[o + 2]);
        }
    }
}

/**
 * @param {ReturnType<typeof createFoodPack>} pack the buckets `packFood` filled
 * @param {number} x a world position
 * @param {{y: number, radius: number}} near its other coordinate and the farthest a carcass may lie from it
 * @returns {number} the row of the nearest carcass within the radius, -1 when none
 */
function carcassNear(pack, x, { y, radius }) {
    const bucket = pack.buckets[CARCASS];
    let best = -1;
    let bestD = radius * radius;
    for (let r = 0; r < bucket.count; r++) {
        const dx = bucket.pose[r * ITEM] - x;
        const dy = bucket.pose[r * ITEM + 1] - y;
        if (dx * dx + dy * dy <= bestD) {
            bestD = dx * dx + dy * dy;
            best = r;
        }
    }
    return best;
}

/** How far from where a body was last seen its carcass may lie, in body radii. */
export const CARCASS_REACH = 2;

/**
 * Cross-fades the carcass a kill leaves in over the leaving beat of the body that died there: the carcass stays dark
 * while the body breaks and brightens as the body fades, so two outlines never meet at full strength. Call it every
 * frame after `packFood` or `swayFood`; it does nothing, and costs nothing, while no eaten body is dying.
 * @param {ReturnType<typeof createFoodPack>} pack the buckets
 * @param {import('./dying.js').Dying} dying the dying bodies
 * @param {{nowMs: number, causeNames: readonly string[]}} view wall time and the cause names by number
 * @returns {void}
 */
export function fadeCarcassesIn(pack, dying, { nowMs, causeNames }) {
    const bucket = pack.buckets[CARCASS];
    let any = false;
    if (pack.carcassFaded) {
        for (let r = 0; r < bucket.count; r++) {
            bucket.neon.set(pack.carcassBase.subarray(r * 3, r * 3 + 3), r * ITEM);
        }
        pack.carcassFaded = false;
    }
    for (let k = 0; k < MAX_DYING; k++) {
        const anim = isPlaying(dying, k) ? animFor(causeNames[dying.cause[k]]) : null;
        if (anim === null || !anim.carcass) {
            continue;
        }
        const w = carcassFadeOf(anim, nowMs - dying.start[k]);
        const radius = dying.pose[3][k] * CARCASS_REACH;
        const r = w < 1 ? carcassNear(pack, dying.pose[0][k], { y: dying.pose[1][k], radius }) : -1;
        for (let c = 0; r >= 0 && c < 3; c++) {
            bucket.neon[r * ITEM + c] = pack.carcassBase[r * 3 + c] * w;
            any = true;
        }
    }
    pack.carcassFaded = any;
}
