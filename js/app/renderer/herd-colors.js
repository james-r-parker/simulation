import { HERD_RIM_LUMINANCE } from './colors.js';

const LUMINANCE = Object.freeze({ red: 0.2126729, green: 0.7151522, blue: 0.072175 });
// Muted earth tones (sand, moss, terracotta, lilac), scaled to `HERD_RIM_LUMINANCE` below: clear of the blue-grey rocks
// and, under the colour-vision-deficiency simulations, of the food teal and the alarm and eaten reds.
const EARTH_TONES = Object.freeze([
    [0.42, 0.26, 0.09],
    [0.17, 0.25, 0.07],
    [0.45, 0.13, 0.06],
    [0.32, 0.15, 0.28],
]);

/** @param {number} group stable herd group id @param {number[] | Float32Array} [out] receives linear RGB @returns {number[] | Float32Array} */
export function herdColor(group, out = [0, 0, 0]) {
    const tone = EARTH_TONES[((Math.trunc(group) % EARTH_TONES.length) + EARTH_TONES.length) % EARTH_TONES.length];
    const y = tone[0] * LUMINANCE.red + tone[1] * LUMINANCE.green + tone[2] * LUMINANCE.blue;
    const scale = HERD_RIM_LUMINANCE / y;
    out[0] = tone[0] * scale;
    out[1] = tone[1] * scale;
    out[2] = tone[2] * scale;
    return out;
}
