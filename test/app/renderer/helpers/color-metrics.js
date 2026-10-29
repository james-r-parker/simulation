// Colour distance for the palette tests: linear RGB to CIE Lab (D65), CIEDE2000 (Sharma, Wu and Dalal's formulation, the
// reference test pairs are in colors.test.js), and the Machado, Oliveira and Fernandes (2009) colour-vision-deficiency
// simulations at full severity, applied in linear RGB.

/** The Machado 2009 matrices at severity 1.0, rows applied to linear [r, g, b]. */
export const MACHADO = Object.freeze({
    protanopia: [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
    deuteranopia: [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.01182, 0.04294, 0.968881],
    ],
    tritanopia: [
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809, 0.147602],
        [0.004733, 0.691367, 0.3039],
    ],
});

/**
 * @param {ArrayLike<number>} rgb linear RGB
 * @param {number[][]} matrix a 3 x 3 matrix
 * @returns {number[]} the matrix applied to the colour, each channel clamped to 0..1
 */
export function simulate(rgb, matrix) {
    return matrix.map((row) => Math.min(Math.max(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2], 0), 1));
}

/**
 * @param {ArrayLike<number>} rgb linear RGB, 0 to 1
 * @returns {[number, number, number]} CIE L*a*b* under D65
 */
export function toLab(rgb) {
    const [r, g, b] = [rgb[0], rgb[1], rgb[2]];
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const f = (/** @type {number} */ t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
    const [fx, fy, fz] = [f(x), f(y), f(z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (/** @type {number} */ deg) => (deg * Math.PI) / 180;
const deg = (/** @type {number} */ r) => (r * 180) / Math.PI;

/**
 * @param {number} b the Lab b*
 * @param {number} ap the adjusted a*
 * @returns {number} the hue angle in degrees, 0 to 360
 */
export function hueAngle(b, ap) {
    if (b === 0 && ap === 0) {
        return 0;
    }
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
}

/**
 * @param {ArrayLike<number>} rgb linear RGB
 * @returns {number} hue angle in degrees, 0 to 360
 */
export function labHue(rgb) {
    const [, a, b] = toLab(rgb);
    return hueAngle(b, a);
}

/**
 * @param {ArrayLike<number>} rgb linear RGB
 * @returns {number} relative luminance (linear Y)
 */
export function luminance(rgb) {
    return 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2];
}

/**
 * @param {[number, number, number]} lab1 a colour in Lab
 * @param {[number, number, number]} lab2 another
 * @returns {number} the CIEDE2000 colour difference
 */
export function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const h1p = hueAngle(b1, a1p);
    const h2p = hueAngle(b2, a2p);
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) {
            dhp -= 360;
        } else if (dhp < -180) {
            dhp += 360;
        }
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;
    let hbarp = h1p + h2p;
    if (C1p * C2p === 0) {
        hbarp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
        hbarp /= 2;
    } else {
        hbarp = (hbarp + (h1p + h2p < 360 ? 360 : -360)) / 2;
    }
    const T =
        1 -
        0.17 * Math.cos(rad(hbarp - 30)) +
        0.24 * Math.cos(rad(2 * hbarp)) +
        0.32 * Math.cos(rad(3 * hbarp + 6)) -
        0.2 * Math.cos(rad(4 * hbarp - 63));
    const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
    const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
    const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
    const Sc = 1 + 0.045 * Cbarp;
    const Sh = 1 + 0.015 * Cbarp * T;
    const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
    return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/**
 * @param {ArrayLike<number>} a a linear RGB colour
 * @param {ArrayLike<number>} b another
 * @param {number[][] | null} [matrix] a colour-vision-deficiency matrix applied to both first, null for normal vision
 * @returns {number} their CIEDE2000 distance
 */
export function colorDistance(a, b, matrix = null) {
    return matrix === null
        ? ciede2000(toLab(a), toLab(b))
        : ciede2000(toLab(simulate(a, matrix)), toLab(simulate(b, matrix)));
}
