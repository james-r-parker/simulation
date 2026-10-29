// Every colour the renderer draws with, in linear RGB, written once. The bloom pass makes values above 1 glow, so a
// triple here is a hue and a ratio, not a ceiling.

import { slotOf } from '../family-slots.js';
import { createPrng } from '../prng.js';

/** @typedef {readonly [number, number, number]} Rgb */

/**
 * The fixed colours, as linear RGB triples (`docs/designs/worker-and-renderer.md`, Look).
 * @type {Readonly<Record<string, Rgb>>}
 */
export const PALETTE = Object.freeze({
    background: [0, 0, 0],
    border: [0.06, 0.06, 0.06],
    food: [0.35, 0.9, 0.7],
    meat: [0.9, 0.1, 0.15],
    obstacleBody: [0.012, 0.016, 0.024],
    obstacleRim: [0.09, 0.12, 0.18],
    rockBody: [0.012, 0.016, 0.024],
    rockRim: [0.09, 0.12, 0.18],
    rockContact: [0.004, 0.005, 0.006],
    lichen: [0.006, 0.014, 0.006],
    frost: [0.006, 0.012, 0.024],
    refugeGlow: [0.011, 0.012, 0.013],
    eye: [0.85, 0.95, 1.0],
    huntScent: [1.0, 0.74, 0.2],
    dangerScent: [0.75, 0.03, 0.04],
    attackScent: [0.5, 0.18, 1.0],
    smoke: [0.03, 0.04, 0.06],
    smokeNoise: [0.06, 0.08, 0.11],
    alarmRing: [1.0, 0.55, 0.62],
    huntRing: [1.0, 0.62, 0.12],
    biteFlash: [1.0, 0.82, 0.78],
    eatenFlash: [1.0, 0.06, 0.08],
    mote: [0.5, 0.65, 0.9],
    coldWater: [0.03, 0.12, 0.9],
    coolWhite: [0.8, 0.92, 1.0],
    heat: [1.0, 0.35, 0.04],
});

/**
 * The three palettes for the top families, eight slots each, as linear RGB. `default` is Okabe-Ito derived and lightened
 * for glow on black; `cvd-safe` keeps every pair at least 20 apart under each colour-vision-deficiency simulation;
 * `high-contrast` is the same kind of hue set at lightness 0.72 (it is drawn with a rim twice as wide). Every slot
 * clears every semantic colour (food, the three scents, the alarm and eaten reds): `colors.test.js` measures it.
 * @type {Readonly<Record<string, readonly Rgb[]>>}
 */
export const FAMILY_PALETTES = Object.freeze({
    default: [
        [0.5486, 0.1458, 0.2526],
        [0.4632, 0.572, 0.2724],
        [0.4389, 0.2938, 0.1938],
        [0.2631, 0.5481, 0.6924],
        [0.2318, 0.3172, 0.4641],
        [0.0646, 0.1327, 0.7405],
        [0.0223, 0.0208, 0.9097],
        [0.2248, 0.173, 0.4088],
    ],
    'cvd-safe': [
        [0.349, 0, 0.0003],
        [0.4745, 0.4765, 0.0011],
        [0.7839, 0.9084, 0.5092],
        [0.0613, 0.108, 0.8263],
        [0.0903, 0.4407, 0.6134],
        [0.0212, 0.0046, 0.2563],
        [0.1168, 0.041, 0.0594],
        [0.3659, 0.1682, 0.1943],
    ],
    'high-contrast': [
        [0.494, 0.3216, 0.2556],
        [0.4917, 0.6228, 0.3338],
        [0.1789, 0.3497, 0.3672],
        [0.1687, 0.5184, 0.8283],
        [0.4319, 0.141, 0.187],
        [0.0169, 0.0155, 0.9308],
        [0.0441, 0.1347, 0.725],
        [1, 0.2886, 0.0113],
    ],
});

/**
 * The colour of every family without a slot, by palette: dim blue-grey at saturation 0.25, dim grey, and (high
 * contrast) grey that is drawn at 35% alpha with no halo.
 * @type {Readonly<Record<string, Rgb>>}
 */
export const NEUTRAL_FAMILY = Object.freeze({
    default: [0.1, 0.12, 0.16],
    'cvd-safe': [0.14, 0.14, 0.14],
    'high-contrast': [0.45, 0.45, 0.45],
});

/** The share of a family's colour an agent at zero energy is drawn with; full energy is drawn at the colour itself. */
export const ENERGY_FLOOR = 0.82;

/**
 * Aurora stops per season (spring, summer, autumn, winter), indexed like `stats.season`. Starting linear RGB before
 * scaling to `AURORA_MAX_LUMINANCE`.
 * @type {readonly Rgb[]}
 */
export const AURORA = Object.freeze([
    [0.1, 0.3, 0.55], // spring: steel blue
    [0.35, 0.1, 0.25], // summer: dusky plum/rose
    [0.3, 0.35, 0.2], // autumn: dull gold
    [0.12, 0.18, 0.35], // winter: indigo-blue
]);

/** The maximum luminance (linear Y) of the aurora. */
export const AURORA_MAX_LUMINANCE = 0.01;

/** The maximum luminance (linear Y) of any scenery colour (lichen, frost, refuge glow). */
export const SCENERY_MAX_LUMINANCE = 0.012;

/**
 * The colour of a family: its slot's colour in the current palette, else the neutral colour, dimmed a little at low
 * energy.
 * @param {import('../family-slots.js').FamilySlots} slots the slots and the palette name
 * @param {number} lineageId a lineage id
 * @param {number} energy01 energy as a share of the maximum, clamped to 0..1
 * @param {number[] | Float32Array} [out] receives the linear RGB triple
 * @returns {number[] | Float32Array} `out`
 */
export function familyColor(slots, lineageId, energy01, out = [0, 0, 0]) {
    const slot = slotOf(slots, lineageId);
    const base = slot >= 0 ? FAMILY_PALETTES[slots.palette][slot] : NEUTRAL_FAMILY[slots.palette];
    const e = Math.min(Math.max(energy01, 0), 1);
    const k = ENERGY_FLOOR + (1 - ENERGY_FLOOR) * e;
    out[0] = base[0] * k;
    out[1] = base[1] * k;
    out[2] = base[2] * k;
    return out;
}

/**
 * @typedef {object} TemperatureBands
 * @property {number} cold below this: deep blue (`temperatureColdStress` / `temperatureMax`)
 * @property {number} optimalMin from here to `optimalMax`: cool white
 * @property {number} optimalMax
 * @property {number} heat at and above this: orange (`temperatureHeatStress` / `temperatureMax`)
 */

/**
 * @param {Record<string, number>} info `ready.info`
 * @returns {TemperatureBands} the bands as shares of `temperatureMax`
 */
export function temperatureBands(info) {
    const max = info.temperatureMax;
    return {
        cold: info.temperatureColdStress / max,
        optimalMin: info.temperatureOptimalMin / max,
        optimalMax: info.temperatureOptimalMax / max,
        heat: info.temperatureHeatStress / max,
    };
}

/**
 * @param {Rgb} a a colour
 * @param {Rgb} b a colour
 * @param {number} t 0 to 1
 * @param {number[] | Float32Array} out receives the blend
 * @returns {void}
 */
function mix(a, b, t, out) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
}

/**
 * The temperature lens colour: deep blue below the cold-stress band, cool white across the optimal band, orange at
 * the heat-stress band and above, blended between.
 * @param {number} t01 temperature as a share of `temperatureMax`
 * @param {TemperatureBands} bands the bands
 * @param {number[] | Float32Array} [out] receives the linear RGB triple
 * @returns {number[] | Float32Array} `out`
 */
export function temperatureColor(t01, bands, out = [0, 0, 0]) {
    const { coldWater, coolWhite, heat } = PALETTE;
    if (t01 <= bands.cold) {
        mix(coldWater, coldWater, 0, out);
    } else if (t01 < bands.optimalMin) {
        mix(coldWater, coolWhite, (t01 - bands.cold) / (bands.optimalMin - bands.cold), out);
    } else if (t01 <= bands.optimalMax) {
        mix(coolWhite, coolWhite, 0, out);
    } else if (t01 < bands.heat) {
        mix(coolWhite, heat, (t01 - bands.optimalMax) / (bands.heat - bands.optimalMax), out);
    } else {
        mix(heat, heat, 0, out);
    }
    return out;
}

/**
 * Fills a lookup table with the temperature colours at `texels` evenly spaced values of `t01`, as RGBA floats for a
 * one-row texture the agent shader samples.
 * @param {TemperatureBands} bands the bands
 * @param {Float32Array} out `4 x texels` floats
 * @returns {Float32Array} `out`
 */
export function temperatureRamp(bands, out) {
    const texels = out.length / 4;
    const rgb = [0, 0, 0];
    for (let i = 0; i < texels; i++) {
        temperatureColor(i / (texels - 1), bands, rgb);
        out.set(rgb, i * 4);
        out[i * 4 + 3] = 1;
    }
    return out;
}

const ONSETS = Object.freeze(['v', 'l', 'k', 'm', 'r', 's', 'n', 't', 'd', 'z', 'h', 'b', 'f', 'g']);
const VOWELS = Object.freeze(['a', 'e', 'i', 'o', 'u']);
const NUMERALS = Object.freeze(['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X', ' XI', ' XII']);

/**
 * @param {number} seed the world seed
 * @param {number} lineageId a lineage id
 * @returns {string} the three-syllable base name
 */
function baseName(seed, lineageId) {
    const prng = createPrng(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(lineageId + 1, 0xc2b2ae35));
    prng.next();
    let name = '';
    for (let i = 0; i < 3; i++) {
        name += ONSETS[prng.int(ONSETS.length)] + VOWELS[prng.int(VOWELS.length)];
    }
    return name[0].toUpperCase() + name.slice(1);
}

/**
 * A pronounceable name for a family, such as "Velari": three consonant-vowel syllables drawn from a generator seeded by
 * the world seed and the lineage id, unique among `top` (a clash takes a numeral: "Velari II").
 * @param {number} seed the world seed
 * @param {number} lineageId a lineage id
 * @param { readonly ({id: number} | number)[] } [top] `stats.lineages.top` in rank order
 * @returns {string} the name
 */
export function familyName(seed, lineageId, top = []) {
    const base = baseName(seed, lineageId);
    let clashes = 0;
    for (const entry of top) {
        const id = typeof entry === 'number' ? entry : entry.id;
        if (id === lineageId) {
            break;
        }
        if (baseName(seed, id) === base) {
            clashes++;
        }
    }
    return `${base}${NUMERALS[clashes]}`;
}
