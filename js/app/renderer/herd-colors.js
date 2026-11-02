import { SCENERY_MAX_LUMINANCE } from './colors.js';

const LUMINANCE = Object.freeze({ red: 0.2126729, green: 0.7151522, blue: 0.072175 });
const EARTH_TONES = Object.freeze([
    [0.045, 0.014, 0.006],
    [0.004, 0.045, 0.01],
    [0.05, 0.005, 0.04],
    [0.02, 0.005, 0.06],
]);

/** @param {number} group stable herd group id @param {number[] | Float32Array} [out] receives linear RGB @returns {number[] | Float32Array} */
export function herdColor(group, out = [0, 0, 0]) {
    const tone = EARTH_TONES[((Math.trunc(group) % EARTH_TONES.length) + EARTH_TONES.length) % EARTH_TONES.length];
    const y = tone[0] * LUMINANCE.red + tone[1] * LUMINANCE.green + tone[2] * LUMINANCE.blue;
    const scale = Math.min(1, SCENERY_MAX_LUMINANCE / y);
    out[0] = tone[0] * scale;
    out[1] = tone[1] * scale;
    out[2] = tone[2] * scale;
    return out;
}
