// The standard normal CDF and its inverse, re-exported by `compare.js` for `scripts/lib/reflex-stats.mjs`. Pure.

import { detExp, detLog } from '../sim/det-math.js';

/**
 * Standard normal CDF (Hart's rational approximation as given by West 2005; absolute error about 1e-15).
 * @param {number} x a value
 * @returns {number} P(Z <= x)
 */
export function normalCdf(x) {
    const a = Math.abs(x);
    if (a > 37) {
        return x > 0 ? 1 : 0;
    }
    const e = detExp(-a * a * 0.5);
    let tail;
    if (a < 7.07106781186547) {
        let num = 3.52624965998911e-2 * a + 0.700383064443688;
        for (const c of [6.37396220353165, 33.912866078383, 112.079291497871, 221.213596169931, 220.206867912376]) {
            num = num * a + c;
        }
        let den = 8.83883476483184e-2 * a + 1.75566716318264;
        for (const c of [16.064177579207, 86.7807322029461, 296.564248779674, 637.333633378831, 793.826512519948]) {
            den = den * a + c;
        }
        tail = (e * num) / (den * a + 440.413735824752);
    } else {
        let build = a + 0.65;
        for (const k of [4, 3, 2, 1]) {
            build = a + k / build;
        }
        tail = e / build / 2.506628274631;
    }
    return x > 0 ? 1 - tail : tail;
}

const ACKLAM_A = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
];
const ACKLAM_B = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
const ACKLAM_C = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
];
const ACKLAM_D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
const ACKLAM_LOW = 0.02425;

/**
 * @param {number[]} coeffs polynomial coefficients, highest degree first
 * @param {number} x the argument
 * @returns {number} the polynomial at x
 */
function horner(coeffs, x) {
    return coeffs.reduce((acc, c) => acc * x + c);
}

/**
 * @param {number} p a probability in (0, 1)
 * @returns {number} Acklam's rational approximation of the quantile (relative error about 1e-9)
 */
function acklam(p) {
    if (p < ACKLAM_LOW || p > 1 - ACKLAM_LOW) {
        const q = Math.sqrt(-2 * detLog(p < 0.5 ? p : 1 - p));
        const z = horner(ACKLAM_C, q) / (horner(ACKLAM_D, q) * q + 1);
        return p < 0.5 ? z : -z;
    }
    const q = p - 0.5;
    const r = q * q;
    return (horner(ACKLAM_A, r) * q) / (horner(ACKLAM_B, r) * r + 1);
}

/**
 * Inverse of the standard normal CDF: Acklam's approximation, refined by one Halley step against `normalCdf`.
 * @param {number} p a probability in (0, 1)
 * @returns {number} z with P(Z <= z) = p
 * @throws {Error} when p is outside (0, 1)
 */
export function normalQuantile(p) {
    if (!(p > 0 && p < 1)) {
        throw new Error(`normalQuantile: p must be in (0, 1), got ${p}`);
    }
    const z = acklam(p);
    const err = normalCdf(z) - p;
    const u = (err * 2.506628274631) / detExp(-z * z * 0.5);
    return z - u / (1 + (z * u) / 2);
}
