// Packs the snapshot's food into one bucket per food model: the six flora species (`FLORA_NAMES` order) and the carcass
// (a negative radius). Each row gets its pose (a seeded turn so neighbours differ), its display colour (the flora hue,
// or meat ageing to rot) and a gentle sway for plants. Pure; nothing allocates after `createFoodPack`.

import { createSections, FOOD_STRIDE, readSections } from '../snapshot-view.js';
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

/**
 * @param {number} capacity the most food items (`maxFood`)
 * @returns {{buckets: {pose: Float32Array, neon: Float32Array, rig0: Float32Array, count: number}[],
 *   sections: import('../snapshot-view.js').Sections, rgb: number[]}} the buckets and scratch
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
    return { buckets, sections: createSections(), rgb: [0, 0, 0] };
}

/**
 * @param {number} x a position
 * @param {number} y a position
 * @returns {number} a stable pseudo-random value in 0 to 1 for the spot
 */
export function spotHash(x, y) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return h - Math.floor(h);
}

/**
 * @param {number[]} rgb receives the colour
 * @param {{kind: number, hue: number, age: number}} food the food's model, hue and age
 * @returns {number[] | Float32Array} `rgb`
 */
function foodColor(rgb, { kind, hue, age }) {
    if (kind !== CARCASS) {
        return toDisplay(floraColor(hue, rgb), rgb);
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
        const rgb = foodColor(pack.rgb, FOOD);
        bucket.neon[o] = rgb[0];
        bucket.neon[o + 1] = rgb[1];
        bucket.neon[o + 2] = rgb[2];
        bucket.neon[o + 3] = FILL_SHARE.default;
        bucket.rig0[o] = 0;
        bucket.rig0[o + 1] = 0;
        bucket.rig0[o + 2] = FOOD.kind === CARCASS ? 0 : SWAY * Math.sin((timeSec * SWAY_HZ + seed) * Math.PI * 2);
        bucket.rig0[o + 3] = 1;
    }
    return s.foodCount;
}
