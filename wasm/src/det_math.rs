//! Line-for-line port of `detExp`, `detTanh` and `detTanhInto` from `js/sim/det-math.js`.
//!
//! Every constant is the JS literal's exact bit pattern, every Horner chain runs in the JS order and every operation is
//! a plain IEEE double operation, so each result is bit-identical to the JS function. The SIMD form keeps two values per
//! `f64x2`, each lane its own chain (vertical lanes only: no horizontal add, no fused multiply-add).

use core::arch::wasm32::{
    f64x2_abs, f64x2_add, f64x2_div, f64x2_floor, f64x2_mul, f64x2_splat, f64x2_sub, i32x4_trunc_sat_f64x2_zero,
    i64x2_add, i64x2_extend_low_i32x4, i64x2_shl, i64x2_splat, v128, v128_and, v128_or,
};

const LN2_HI: f64 = f64::from_bits(0x3fe6_2e42_fee0_0000); // 0.6931471803691238
const LN2_LO: f64 = f64::from_bits(0x3dea_39ef_3579_3c76); // 1.9082149292705877e-10
const INV_LN2: f64 = f64::from_bits(0x3ff7_1547_652b_82fe); // 1.4426950408889634
const EXP_DEGREE: i32 = 13;
const EXPONENT_BIAS: i64 = 1023;
const TANH_SATURATION: f64 = 20.0;
const SIGN_MASK: i64 = i64::MIN;

/// `Math.floor` for a double: the SIMD `floor` instruction is IEEE `roundTowardNegative`, exact for every value.
#[inline(always)]
pub fn floor(x: f64) -> f64 {
    core::arch::wasm32::f64x2_extract_lane::<0>(f64x2_floor(f64x2_splat(x)))
}

/// 2^k exactly, from the exponent bits, for an integer k in [-1022, 1023] (`pow2` in det-math.js).
#[inline(always)]
fn pow2(k: f64) -> f64 {
    f64::from_bits(((k as i64 + EXPONENT_BIAS) as u64) << 52)
}

/// `detExp` for x in [-708, 709]; the caller keeps x in range (the tanh path passes x in [-40, 0)).
#[inline(always)]
pub fn det_exp(x: f64) -> f64 {
    let k = floor(x * INV_LN2 + 0.5);
    let r = x - k * LN2_HI - k * LN2_LO;
    let mut p = 1.0;
    let mut n = EXP_DEGREE;
    while n >= 1 {
        p = 1.0 + (r / n as f64) * p;
        n -= 1;
    }
    p * pow2(k)
}

/// `detTanh` for a finite x (the caller checks finiteness, because the JS function throws there).
#[inline(always)]
pub fn det_tanh(x: f64) -> f64 {
    if x == 0.0 {
        return x;
    }
    let sign = if x > 0.0 { 1.0 } else { -1.0 };
    let a = if x > 0.0 { x } else { -x };
    if a > TANH_SATURATION {
        return sign;
    }
    let t = det_exp(-2.0 * a);
    (sign * (1.0 - t)) / (1.0 + t)
}

/// `detSigmoid`: `0.5 + 0.5 tanh(x / 2)` for a finite x.
#[inline(always)]
pub fn det_sigmoid(x: f64) -> f64 {
    0.5 + 0.5 * det_tanh(0.5 * x)
}

/// True when `detTanh` takes its exp path: finite, nonzero and within the saturation limit (`isFastTanh`).
#[inline(always)]
fn is_fast(x: f64) -> bool {
    let a = if x < 0.0 { -x } else { x };
    a > 0.0 && a <= TANH_SATURATION
}

/// The exp-path tanh of two values at once; both lanes must pass `is_fast`. Each lane runs the scalar chain's exact
/// operations, so each result equals `det_tanh` of that lane.
#[inline(always)]
fn tanh2(x: v128) -> v128 {
    let one = f64x2_splat(1.0);
    let (r, k) = reduce2(x);
    let mut p = one;
    let mut d = EXP_DEGREE;
    while d >= 1 {
        p = f64x2_add(one, f64x2_mul(f64x2_div(r, f64x2_splat(d as f64)), p));
        d -= 1;
    }
    finish2(x, p, k)
}

/// The exp-path tanh of four values in two `f64x2`; every lane must pass `is_fast`. The two Horner chains are
/// independent, so they share one loop and the processor overlaps them.
#[inline(always)]
fn tanh4(x0: v128, x1: v128) -> (v128, v128) {
    let one = f64x2_splat(1.0);
    let (r0, k0) = reduce2(x0);
    let (r1, k1) = reduce2(x1);
    let (mut p0, mut p1) = (one, one);
    let mut d = EXP_DEGREE;
    while d >= 1 {
        let dv = f64x2_splat(d as f64);
        p0 = f64x2_add(one, f64x2_mul(f64x2_div(r0, dv), p0));
        p1 = f64x2_add(one, f64x2_mul(f64x2_div(r1, dv), p1));
        d -= 1;
    }
    (finish2(x0, p0, k0), finish2(x1, p1, k1))
}

/// The reduced argument and power of two of `exp(-2 |x|)` for two lanes (`tanhReduced`, `tanhExponent`).
#[inline(always)]
fn reduce2(x: v128) -> (v128, v128) {
    let m2a = f64x2_mul(f64x2_splat(-2.0), f64x2_abs(x));
    let k = f64x2_floor(f64x2_add(f64x2_mul(m2a, f64x2_splat(INV_LN2)), f64x2_splat(0.5)));
    let r = f64x2_sub(
        f64x2_sub(m2a, f64x2_mul(k, f64x2_splat(LN2_HI))),
        f64x2_mul(k, f64x2_splat(LN2_LO)),
    );
    (r, k)
}

/// `tanhFinish` for two lanes: `sign(x) (1 - t) / (1 + t)` with `t = p 2^k`.
#[inline(always)]
fn finish2(x: v128, p: v128, k: v128) -> v128 {
    let one = f64x2_splat(1.0);
    let ki = i64x2_extend_low_i32x4(i32x4_trunc_sat_f64x2_zero(k));
    let t = f64x2_mul(p, i64x2_shl(i64x2_add(ki, i64x2_splat(EXPONENT_BIAS)), 52));
    let sign = v128_or(v128_and(x, i64x2_splat(SIGN_MASK)), one);
    f64x2_div(f64x2_mul(sign, f64x2_sub(one, t)), f64x2_add(one, t))
}

/// Writes `detTanh(v[i])` back over `v[i]` for i below n (`detTanhInto` in place). Returns 0, or i + 1 for the first
/// non-finite value, which is left unchanged: the JS function throws there, and so does the caller.
///
/// # Safety
/// `v` must point at `n` readable and writable doubles.
#[inline(always)]
pub unsafe fn tanh_in_place(v: *mut f64, n: usize) -> usize {
    let mut i = 0;
    // Four at a time while every value takes the exp path; from the first group that does not, pairs and scalars.
    while i + 4 <= n {
        // SAFETY: i + 3 < n.
        let fast =
            unsafe { is_fast(*v.add(i)) && is_fast(*v.add(i + 1)) && is_fast(*v.add(i + 2)) && is_fast(*v.add(i + 3)) };
        if !fast {
            break;
        }
        // SAFETY: four doubles at v + i; unaligned access is allowed in wasm.
        unsafe {
            let p = v.add(i) as *mut v128;
            let (y0, y1) = tanh4(p.read_unaligned(), p.add(1).read_unaligned());
            p.write_unaligned(y0);
            p.add(1).write_unaligned(y1);
        }
        i += 4;
    }
    while i + 2 <= n {
        // SAFETY: i + 1 < n.
        let (x0, x1) = unsafe { (*v.add(i), *v.add(i + 1)) };
        if is_fast(x0) && is_fast(x1) {
            // SAFETY: two doubles at v + i; unaligned access is allowed in wasm.
            unsafe { (v.add(i) as *mut v128).write_unaligned(tanh2((v.add(i) as *const v128).read_unaligned())) };
        } else {
            for j in i..i + 2 {
                // SAFETY: j < n.
                let x = unsafe { *v.add(j) };
                if !x.is_finite() {
                    return j + 1;
                }
                unsafe { *v.add(j) = det_tanh(x) };
            }
        }
        i += 2;
    }
    if i < n {
        // SAFETY: i < n.
        let x = unsafe { *v.add(i) };
        if !x.is_finite() {
            return i + 1;
        }
        unsafe { *v.add(i) = det_tanh(x) };
    }
    0
}
