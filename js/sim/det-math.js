// Engine-independent sin, cos, exp, log and tanh built from + - * / and Math.floor only.

const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1.4426950408889634;
const INV_PIO2 = 0.6366197723675814;
const PIO2_1 = 1.5707963267341256;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_3 = 2.0222662487111665e-21;

const EXP_MIN = -708;
const EXP_MAX = 709;
const TRIG_LIMIT = 1e6;
const TANH_SATURATION = 20;
const SIN_DEGREE = 17;
const COS_DEGREE = 18;
const EXP_DEGREE = 13;
const LOG_DEGREE = 21;
const EXPONENT_BIAS = 1023;
const SUBNORMAL_SCALE_BITS = 54;
const SUBNORMAL_SCALE = 18014398509481984; // 2^54
const MIN_NORMAL = 2.2250738585072014e-308;
const SQRT2 = 1.4142135623730951;
const MANTISSA_MASK = 0x000fffff;
const HIGH = 1;

// One 8-byte scratch buffer: the only import-time allocation in js/sim/.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/**
 * Build 2^k exactly by writing the exponent bits.
 * @param {number} k Integer exponent in [-1022, 1023].
 * @returns {number} 2^k.
 */
function pow2(k) {
    u32[0] = 0;
    u32[HIGH] = ((k + EXPONENT_BIAS) << 20) >>> 0;
    return f64[0];
}

/**
 * Taylor polynomial of sin(r) / r in r^2, by Horner.
 * @param {number} r Reduced argument.
 * @returns {number} sin(r).
 */
function sinPoly(r) {
    const r2 = r * r;
    let p = 1;
    for (let n = SIN_DEGREE; n >= 3; n -= 2) {
        p = 1 - (r2 / ((n - 1) * n)) * p;
    }
    return r * p;
}

/**
 * Taylor polynomial of cos(r) in r^2, by Horner.
 * @param {number} r Reduced argument.
 * @returns {number} cos(r).
 */
function cosPoly(r) {
    const r2 = r * r;
    let p = 1;
    for (let n = COS_DEGREE; n >= 2; n -= 2) {
        p = 1 - (r2 / ((n - 1) * n)) * p;
    }
    return p;
}

/**
 * Sine of k * pi/2 + r, picking the polynomial and sign by quadrant.
 * @param {number} k Integer quarter-turn count.
 * @param {number} r Reduced argument.
 * @returns {number} sin(k * pi/2 + r).
 */
function quadrantSin(k, r) {
    const q = k & 3;
    if (q === 0) {
        return sinPoly(r);
    }
    if (q === 1) {
        return cosPoly(r);
    }
    return q === 2 ? -sinPoly(r) : -cosPoly(r);
}

/**
 * Reduce x to r in about [-pi/4, pi/4] and return the quarter-turn count.
 * @param {number} x Argument.
 * @returns {number} k, the nearest integer to x / (pi/2).
 */
function quarterTurns(x) {
    return Math.floor(x * INV_PIO2 + 0.5);
}

/**
 * @param {number} x Argument.
 * @param {number} k Quarter-turn count from quarterTurns.
 * @returns {number} x - k * pi/2.
 */
function reduce(x, k) {
    return x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3;
}

/**
 * @param {string} name Function name for the error.
 * @param {number} x Argument.
 * @returns {void}
 */
function checkTrig(name, x) {
    if (!(Math.abs(x) <= TRIG_LIMIT)) {
        throw new Error(`${name}: expected abs(x) <= ${TRIG_LIMIT}, got ${x}`);
    }
}

/**
 * Deterministic sine.
 * @param {number} x Radians, abs(x) <= 1e6.
 * @returns {number} sin(x).
 */
export function detSin(x) {
    checkTrig('detSin', x);
    const k = quarterTurns(x);
    return quadrantSin(k, reduce(x, k));
}

/**
 * Deterministic cosine.
 * @param {number} x Radians, abs(x) <= 1e6.
 * @returns {number} cos(x).
 */
export function detCos(x) {
    checkTrig('detCos', x);
    const k = quarterTurns(x);
    return quadrantSin(k + 1, reduce(x, k));
}

/**
 * Deterministic e^x.
 * @param {number} x Exponent in [-708, 709].
 * @returns {number} e^x.
 */
export function detExp(x) {
    if (!(x >= EXP_MIN && x <= EXP_MAX)) {
        throw new Error(`detExp: expected x in [${EXP_MIN}, ${EXP_MAX}], got ${x}`);
    }
    const k = Math.floor(x * INV_LN2 + 0.5);
    const r = x - k * LN2_HI - k * LN2_LO;
    let p = 1;
    for (let n = EXP_DEGREE; n >= 1; n -= 1) {
        p = 1 + (r / n) * p;
    }
    return p * pow2(k);
}

/**
 * Split a positive finite x into m * 2^e with m in [sqrt(1/2), sqrt(2)).
 * @param {number} x Positive finite value.
 * @returns {{m: number, e: number}} Mantissa and exponent.
 */
function splitFloat(x) {
    let scaled = x;
    let e = 0;
    if (x < MIN_NORMAL) {
        scaled = x * SUBNORMAL_SCALE;
        e = -SUBNORMAL_SCALE_BITS;
    }
    f64[0] = scaled;
    e += ((u32[HIGH] >>> 20) & 0x7ff) - EXPONENT_BIAS;
    u32[HIGH] = (u32[HIGH] & MANTISSA_MASK) | (EXPONENT_BIAS << 20);
    let m = f64[0];
    if (m > SQRT2) {
        m /= 2;
        e += 1;
    }
    return { m, e };
}

/**
 * Deterministic natural logarithm.
 * @param {number} x Finite value greater than 0.
 * @returns {number} ln(x).
 */
export function detLog(x) {
    if (!(x > 0 && x < Infinity)) {
        throw new Error(`detLog: expected a finite x > 0, got ${x}`);
    }
    const { m, e } = splitFloat(x);
    const s = (m - 1) / (m + 1);
    const s2 = s * s;
    let p = 1 / LOG_DEGREE;
    for (let n = LOG_DEGREE - 2; n >= 1; n -= 2) {
        p = 1 / n + s2 * p;
    }
    return 2 * s * p + e * LN2_HI + e * LN2_LO;
}

/**
 * Deterministic hyperbolic tangent.
 * @param {number} x Finite value.
 * @returns {number} tanh(x); -0 for -0.
 */
export function detTanh(x) {
    if (!Number.isFinite(x)) {
        throw new Error(`detTanh: expected a finite x, got ${x}`);
    }
    if (x === 0) {
        return x;
    }
    const a = Math.abs(x);
    if (a > TANH_SATURATION) {
        return Math.sign(x);
    }
    const t = detExp(-2 * a);
    return (Math.sign(x) * (1 - t)) / (1 + t);
}

/**
 * @param {number} x Finite value, 0 < abs(x) <= 20.
 * @returns {number} The integer k nearest to -2 * abs(x) / ln 2, the power of two in exp(-2 * abs(x)).
 */
function tanhExponent(x) {
    return Math.floor(-2 * Math.abs(x) * INV_LN2 + 0.5);
}

/**
 * @param {number} x Finite value, 0 < abs(x) <= 20.
 * @param {number} k The exponent from tanhExponent.
 * @returns {number} The reduced argument of exp(-2 * abs(x)), computed as detExp does.
 */
function tanhReduced(x, k) {
    return -2 * Math.abs(x) - k * LN2_HI - k * LN2_LO;
}

/**
 * @param {number} x Finite value, 0 < abs(x) <= 20.
 * @param {number} p The Horner polynomial of exp(r).
 * @param {number} k The exponent from tanhExponent.
 * @returns {number} tanh(x), as detTanh computes it from the same p and k.
 */
function tanhFinish(x, p, k) {
    const t = p * pow2(k);
    return (Math.sign(x) * (1 - t)) / (1 + t);
}

/**
 * Writes `detTanh(src[i])` to `dst[at + i]` for i below n, bit-identical to calling detTanh one value at a time. Four
 * values share one pass over the exp polynomial: their Horner chains are independent, so the processor overlaps them
 * instead of waiting on each in turn. Any group holding a zero, a saturated value or a non-finite one takes the scalar
 * path, so its edge cases and errors are detTanh's.
 * @param {ArrayLike<number>} src Values to transform.
 * @param {{[index: number]: number}} dst Destination.
 * @param {number} at Offset of the first result in dst.
 * @param {number} n How many values.
 * @returns {void}
 */
export function detTanhInto(src, dst, at, n) {
    let i = 0;
    for (; i + 4 <= n; i += 4) {
        const x0 = src[i];
        const x1 = src[i + 1];
        const x2 = src[i + 2];
        const x3 = src[i + 3];
        const ok = isFastTanh(x0) && isFastTanh(x1) && isFastTanh(x2) && isFastTanh(x3);
        if (!ok) {
            dst[at + i] = detTanh(x0);
            dst[at + i + 1] = detTanh(x1);
            dst[at + i + 2] = detTanh(x2);
            dst[at + i + 3] = detTanh(x3);
            continue;
        }
        const k0 = tanhExponent(x0);
        const k1 = tanhExponent(x1);
        const k2 = tanhExponent(x2);
        const k3 = tanhExponent(x3);
        const r0 = tanhReduced(x0, k0);
        const r1 = tanhReduced(x1, k1);
        const r2 = tanhReduced(x2, k2);
        const r3 = tanhReduced(x3, k3);
        let p0 = 1;
        let p1 = 1;
        let p2 = 1;
        let p3 = 1;
        for (let d = EXP_DEGREE; d >= 1; d -= 1) {
            p0 = 1 + (r0 / d) * p0;
            p1 = 1 + (r1 / d) * p1;
            p2 = 1 + (r2 / d) * p2;
            p3 = 1 + (r3 / d) * p3;
        }
        dst[at + i] = tanhFinish(x0, p0, k0);
        dst[at + i + 1] = tanhFinish(x1, p1, k1);
        dst[at + i + 2] = tanhFinish(x2, p2, k2);
        dst[at + i + 3] = tanhFinish(x3, p3, k3);
    }
    for (; i < n; i++) {
        dst[at + i] = detTanh(src[i]);
    }
}

/**
 * @param {number} x Any number.
 * @returns {boolean} True when detTanh takes its exp path for x: finite, nonzero and within the saturation limit.
 */
function isFastTanh(x) {
    const a = Math.abs(x);
    return a > 0 && a <= TANH_SATURATION;
}
