// Interleaved gradient noise (Jimenez 2014) shared by the aurora dither and the finish grain.
// Pure: no WebGL dependencies.

export const INTERLEAVED_MAGIC1 = 0.06711056;
export const INTERLEAVED_MAGIC2 = 0.00583715;
export const INTERLEAVED_MULT = 52.9829189;
export const INTERLEAVED_FRAME_OFFSET = 5.588238;

export const FINISH_NOISE_GLSL = /* glsl */ `
float interleavedNoise(vec2 coord, float frame) {
    coord += frame * 5.588238;
    return fract(52.9829189 * fract(dot(coord, vec2(0.06711056, 0.00583715))));
}
`;

/**
 * JS reference implementation of the interleaved gradient noise with identical constants.
 *
 * @param {number} x screen x coordinate
 * @param {number} y screen y coordinate
 * @param {number} [frame=0] frame count
 * @returns {number} noise in [0, 1)
 */
export function interleavedNoise(x, y, frame = 0) {
    const fx = x + frame * INTERLEAVED_FRAME_OFFSET;
    const fy = y + frame * INTERLEAVED_FRAME_OFFSET;
    const magic = (INTERLEAVED_MAGIC1 * fx + INTERLEAVED_MAGIC2 * fy) % 1;
    const fract1 = magic < 0 ? magic + 1 : magic;
    return (INTERLEAVED_MULT * fract1) % 1;
}
