// Procedural rock obstacle geometry and instance packing.
// Pure: no WebGL dependencies, deterministic per (seed, slot).

import { createPrng } from '../prng.js';

export const HARMONIC_COUNT = 3;
export const SHAPE_FLOATS = 7;
export const PACKED_SHAPE_FLOATS = 4;
export const ROCK_BASE_SCALE = 1;
export const ROCK_MAX_INSET = 0.12;

/**
 * Fills three harmonic amplitudes, three phases and a lichen seed for an obstacle slot.
 *
 * @param {number} seed world seed
 * @param {number} slot obstacle slot index
 * @param {Float32Array | number[]} [out] preallocated array of at least 7 floats
 * @returns {Float32Array | number[]} out filled with [a1, a2, a3, p1, p2, p3, lichenSeed]
 */
export function rockShape(seed, slot, out = new Float32Array(SHAPE_FLOATS)) {
    const slotSeed = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((slot + 1) >>> 0, 0xc2b2ae35)) >>> 0;
    const prng = createPrng(slotSeed);

    const w1 = prng.next();
    const w2 = prng.next();
    const w3 = prng.next();
    const sumW = Math.max(w1 + w2 + w3, 1e-9);
    const totalScale = 0.5 + 0.5 * prng.next(); // Amplitudes sum to totalScale <= 1.0

    out[0] = (w1 / sumW) * totalScale;
    out[1] = (w2 / sumW) * totalScale;
    out[2] = (w3 / sumW) * totalScale;
    out[3] = prng.next() * 2 * Math.PI;
    out[4] = prng.next() * 2 * Math.PI;
    out[5] = prng.next() * 2 * Math.PI;
    out[6] = prng.next();
    return out;
}

/**
 * Evaluates the rock boundary radius at a given angle.
 *
 * @param {ArrayLike<number>} shape [a1, a2, a3, p1, p2, p3, lichenSeed]
 * @param {number} angle angle in radians
 * @param {number} [radius=1] collision radius to scale
 * @returns {number} radius in [0.88, 1.0] * radius
 */
export function rockOutline(shape, angle, radius = 1) {
    const a1 = shape[0];
    const a2 = shape[1];
    const a3 = shape[2];
    const p1 = shape[3];
    const p2 = shape[4];
    const p3 = shape[5];

    const h1 = a1 * Math.sin(2 * angle + p1);
    const h2 = a2 * Math.sin(3 * angle + p2);
    const h3 = a3 * Math.sin(5 * angle + p3);
    const harmonicSum = h1 + h2 + h3;

    const factor = ROCK_BASE_SCALE - ROCK_MAX_INSET * (0.5 + 0.5 * harmonicSum);
    return radius * factor;
}

/**
 * Packs 7 rock shape floats into 4 floats (vec4 attribute iShape).
 *
 * @param {ArrayLike<number>} shape 7 shape floats
 * @param {Float32Array} [out] destination array
 * @param {number} [offset=0] write offset
 * @returns {Float32Array} out
 */
export function packRockShape(shape, out = new Float32Array(PACKED_SHAPE_FLOATS), offset = 0) {
    out[offset] = Math.floor(shape[0] * 1000) + shape[3] / 10;
    out[offset + 1] = Math.floor(shape[1] * 1000) + shape[4] / 10;
    out[offset + 2] = Math.floor(shape[2] * 1000) + shape[5] / 10;
    out[offset + 3] = shape[6];
    return out;
}
