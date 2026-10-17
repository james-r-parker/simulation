// Engine-independent sin, cos, exp, log, tanh and sigmoid built from + - * / and Math.floor only.

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
 * Deterministic logistic function, `1 / (1 + e^-x)`, as `0.5 + 0.5 tanh(x / 2)`.
 * @param {number} x Finite value.
 * @returns {number} sigmoid(x), in [0, 1].
 */
export function detSigmoid(x) {
    return 0.5 + 0.5 * detTanh(0.5 * x);
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
