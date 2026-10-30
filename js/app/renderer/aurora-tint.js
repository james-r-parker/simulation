// Evaluates the seasonal aurora tint, gain and noise phase offsets.
// Pure: no WebGL dependencies.

import { AURORA, AURORA_MAX_LUMINANCE } from './colors.js';
import { smoothstep } from './curves.js';

export const AURORA_PERIOD_SECONDS = 40;
export const GAIN_MIDPOINT = 0.775;
export const GAIN_AMPLITUDE = 0.225;

/**
 * @param {ArrayLike<number>} rgb linear RGB
 * @returns {number} linear relative luminance
 */
function luminance(rgb) {
    return 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2];
}

/**
 * Aurora tint stops scaled to AURORA_MAX_LUMINANCE at gain 1.
 */
export const AURORA_STOPS = Object.freeze(
    AURORA.map((rgb) => {
        const scale = AURORA_MAX_LUMINANCE / luminance(rgb);
        return Object.freeze([rgb[0] * scale, rgb[1] * scale, rgb[2] * scale]);
    }),
);

/**
 * Returns the season stop blended smoothly towards the next season between progress 0.7 and 1.0,
 * scaled to the luminance ceiling.
 *
 * @param {number} season current season index (0: spring, 1: summer, 2: autumn, 3: winter)
 * @param {number} progress progress through the season [0, 1]
 * @param {Float32Array | number[]} [out] destination array of 3 floats
 * @returns {Float32Array | number[]} linear RGB tint scaled to the luminance ceiling
 */
export function auroraTint(season, progress, out = new Float32Array(3)) {
    const s = ((season % 4) + 4) % 4;
    const nextS = (s + 1) % 4;
    const curr = AURORA_STOPS[s];
    const next = AURORA_STOPS[nextS];
    const blend = smoothstep(0.7, 1.0, progress);

    out[0] = curr[0] + (next[0] - curr[0]) * blend;
    out[1] = curr[1] + (next[1] - curr[1]) * blend;
    out[2] = curr[2] + (next[2] - curr[2]) * blend;
    return out;
}

/**
 * Wanders between 0.55 and 1.0 on a 40 s sine.
 *
 * @param {number} tSeconds wall time in seconds
 * @returns {number} gain in [0.55, 1.0]
 */
export function auroraGain(tSeconds) {
    return GAIN_MIDPOINT + GAIN_AMPLITUDE * Math.sin(tSeconds * ((2 * Math.PI) / AURORA_PERIOD_SECONDS));
}

/**
 * Returns three noise time offsets advancing at 0.011, 0.017 and 0.023 units/s.
 *
 * @param {number} tSeconds wall time in seconds
 * @param {Float32Array | number[]} [out] destination array of 3 floats
 * @returns {Float32Array | number[]} phase offsets
 */
export function auroraPhase(tSeconds, out = new Float32Array(3)) {
    out[0] = tSeconds * 0.011;
    out[1] = tSeconds * 0.017;
    out[2] = tSeconds * 0.023;
    return out;
}

export { AURORA, AURORA_MAX_LUMINANCE };
