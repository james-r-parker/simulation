// The aurora's ribbon field: the constants the ribbon shader is templated from and a JS reference of its centre line, so
// a test can measure how the ribbons move. Pure: no WebGL dependencies.

/** The resting height of each ribbon's centre line, as a share of the canvas height from the bottom. */
export const RIBBON_BASE = Object.freeze([0.27, 0.5, 0.73]);
/** How far a centre line sways, in canvas heights (peak to peak, before the noise's own range). */
export const RIBBON_SWAY = 0.34;
/** Noise cycles of a centre line across the canvas width. */
export const RIBBON_FREQ = 2.2;
/** Noise units a centre line drifts per unit of `auroraPhase`; the phase itself runs at 0.011 to 0.023 a second. */
export const RIBBON_SPEED = 8;
/** The Gaussian's 1 / (2 sigma squared), with sigma 0.085 canvas heights. */
export const RIBBON_TIGHTNESS = 69;

/**
 * @param {number} x a coordinate
 * @returns {number} x - floor(x)
 */
function fract(x) {
    return x - Math.floor(x);
}

/**
 * @param {number} px x
 * @param {number} py y
 * @returns {number} the GLSL `hash21` of `noise-glsl.js`
 */
function hash21(px, py) {
    let x = fract(px * 123.34);
    let y = fract(py * 456.21);
    const d = x * (x + 45.32) + y * (y + 45.32);
    x += d;
    y += d;
    return fract(x * y);
}

/**
 * @param {number} x x
 * @param {number} y y
 * @returns {number} the GLSL `valueNoise` of `noise-glsl.js`, 0 to 1
 */
function valueNoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const top = hash21(ix, iy + 1) * (1 - ux) + hash21(ix + 1, iy + 1) * ux;
    const bottom = hash21(ix, iy) * (1 - ux) + hash21(ix + 1, iy) * ux;
    return bottom * (1 - uy) + top * uy;
}

/**
 * @param {number} x x
 * @param {number} y y
 * @returns {number} the GLSL `fbm2` of `noise-glsl.js`
 */
function fbm2(x, y) {
    return valueNoise(x, y) * 0.65 + valueNoise(x * 2.07 + 17.3, y * 2.07 + 17.3) * 0.35;
}

/**
 * The reference of the shader's `ribbonCentre`.
 * @param {number} u the position across the canvas, 0 to 1
 * @param {number} index the ribbon, 0 to 2
 * @param {number} phase that ribbon's `auroraPhase`
 * @returns {number} the centre line's height as a share of the canvas height from the bottom
 */
export function ribbonCentre(u, index, phase) {
    return (
        RIBBON_BASE[index] +
        RIBBON_SWAY * (fbm2(u * RIBBON_FREQ + index * 7.3, phase * RIBBON_SPEED + index * 3.7) - 0.5)
    );
}

/** The GLSL of the ribbon field: `ribbonCentre(u, index, phase)` and `ribbonAt(uv, index, phase)`, 0 to 1. Needs `NOISE_GLSL`. */
export const RIBBON_GLSL = /* glsl */ `
float ribbonCentre(float u, float idx, float phase) {
    float base = idx < 0.5 ? ${RIBBON_BASE[0].toFixed(2)} : (idx < 1.5 ? ${RIBBON_BASE[1].toFixed(2)} : ${RIBBON_BASE[2].toFixed(2)});
    return base + ${RIBBON_SWAY.toFixed(2)} * (fbm2(vec2(u * ${RIBBON_FREQ.toFixed(1)} + idx * 7.3, phase * ${RIBBON_SPEED.toFixed(1)} + idx * 3.7)) - 0.5);
}
float ribbonAt(vec2 uv, float idx, float phase) {
    float d = uv.y - ribbonCentre(uv.x, idx, phase);
    float band = exp(-d * d * ${RIBBON_TIGHTNESS.toFixed(1)});
    float along = 0.4 + 0.6 * valueNoise(vec2(uv.x * 4.0 + phase * 9.0, idx * 5.1));
    float rays = 0.65 + 0.35 * valueNoise(vec2(uv.x * 26.0 + phase * 30.0, uv.y * 2.0 + idx));
    return band * along * rays;
}
`;
