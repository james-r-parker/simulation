// Every colour the renderer draws with, in linear RGB, written once. The bloom pass makes values above 1 glow, so a
// triple here is a hue and a ratio, not a ceiling.

/** @typedef {readonly [number, number, number]} Rgb */

/**
 * The fixed colours, as linear RGB triples (`docs/designs/worker-and-renderer.md`, Look).
 * @type {Readonly<Record<string, Rgb>>}
 */
export const PALETTE = Object.freeze({
    background: [0, 0, 0],
    border: [0.06, 0.06, 0.06],
    food: [0.35, 0.9, 0.7],
    obstacleBody: [0.012, 0.016, 0.024],
    obstacleRim: [0.09, 0.12, 0.18],
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

/** Saturation and the lightness range of a lineage colour (HSL, before the sRGB decode). */
const SATURATION = 0.7;
const LIGHTNESS_LOW = 0.5;
const LIGHTNESS_HIGH = 0.62;
/** The golden-ratio step that spreads consecutive lineage ids around the hue wheel. */
const GOLDEN = 0.618034;

/**
 * @param {number} c an sRGB channel, 0 to 1
 * @returns {number} the linear value
 */
function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {number} h hue, 0 to 1
 * @param {number} s saturation, 0 to 1
 * @param {number} l lightness, 0 to 1
 * @param {number} n which channel: 0 red, 8 green, 4 blue
 * @returns {number} that sRGB channel
 */
function hslChannel(h, s, l, n) {
    const a = s * Math.min(l, 1 - l);
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
}

/**
 * @param {number} lineageId a lineage id
 * @returns {number} its hue, 0 to 1: `fract(lineageId x 0.618034)`
 */
export function lineageHue(lineageId) {
    const h = lineageId * GOLDEN;
    return h - Math.floor(h);
}

/**
 * The colour of a lineage: hue from the id, saturation 0.7 and lightness 0.5 to 0.62 by energy.
 * @param {number} lineageId a lineage id
 * @param {number} energy01 energy as a share of the maximum, clamped to 0..1
 * @param {number[] | Float32Array} [out] receives the linear RGB triple
 * @returns {number[] | Float32Array} `out`
 */
export function lineageColor(lineageId, energy01, out = [0, 0, 0]) {
    const e = Math.min(Math.max(energy01, 0), 1);
    const l = LIGHTNESS_LOW + (LIGHTNESS_HIGH - LIGHTNESS_LOW) * e;
    const h = lineageHue(lineageId);
    out[0] = srgbToLinear(hslChannel(h, SATURATION, l, 0));
    out[1] = srgbToLinear(hslChannel(h, SATURATION, l, 8));
    out[2] = srgbToLinear(hslChannel(h, SATURATION, l, 4));
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

/** Hue names every 30 degrees from red. */
const HUE_NAMES = Object.freeze([
    'Red',
    'Amber',
    'Gold',
    'Lime',
    'Green',
    'Jade',
    'Teal',
    'Azure',
    'Blue',
    'Violet',
    'Magenta',
    'Rose',
]);

/**
 * @param {number} lineageId a lineage id
 * @returns {string} a stable name such as "Amber 12": the nearest hue name and the id
 */
export function familyName(lineageId) {
    const bucket = Math.floor(((lineageHue(lineageId) * 360 + 15) % 360) / 30);
    return `${HUE_NAMES[bucket]} ${lineageId}`;
}
