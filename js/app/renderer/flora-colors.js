// Maps the plant hue coordinate to the bounded linear RGB ramp used by flora rendering.
import { PALETTE } from './colors.js';

/** The luminance of the existing food colour at its display intensity. */
export const FLORA_MAX_LUMINANCE =
    0.4 * (0.2126729 * PALETTE.food[0] + 0.7151522 * PALETTE.food[1] + 0.072175 * PALETTE.food[2]);

/**
 * Writes the green-to-magenta HSL hue ramp at saturation 1 and lightness 0.5, bounded by the food ceiling.
 * @param {number} hue plant hue in [-1, 1]
 * @param {number[] | Float32Array} out RGB scratch
 * @returns {number[] | Float32Array} the same scratch array
 */
export function floraColor(hue, out) {
    const h = (120 - (180 * (Math.max(-1, Math.min(1, hue)) + 1)) / 2 + 360) % 360;
    const x = 1 - Math.abs(((h / 60) % 2) - 1);
    if (h < 60) {
        out[0] = 1;
        out[1] = x;
        out[2] = 0;
    } else if (h < 120) {
        out[0] = x;
        out[1] = 1;
        out[2] = 0;
    } else if (h < 180) {
        out[0] = 0;
        out[1] = 1;
        out[2] = x;
    } else {
        out[0] = 1;
        out[1] = 0;
        out[2] = x;
    }
    const y = 0.2126729 * out[0] + 0.7151522 * out[1] + 0.072175 * out[2];
    const scale = Math.min(1, FLORA_MAX_LUMINANCE / y);
    out[0] *= scale;
    out[1] *= scale;
    out[2] *= scale;
    return out;
}
