//! The brain phase: `poolRays`, `hiddenStep`, `outputStep` (with `addSkip`) and `hebbianStep` from `js/sim/brain.js`,
//! `js/sim/ray-pool.js` and `js/sim/hebbian.js`, for every alive slot in ascending order, in one call.
//!
//! Bit-identity rules (docs/designs/wasm-kernels.md): each hidden unit and each output adds its terms in the JS order
//! (bias, nonzero pooled inputs in index order, recurrent rows in index order; bias, hidden rows, nonzero skip rows), each
//! `f32` widens to `f64` before its multiply, every sum is `f64`, and `as f32` stands exactly where the JS stores into
//! a `Float32Array`. SIMD lanes are vertical: two units per `f64x2`, each lane its own sequential chain.

use core::arch::wasm32::{
    f32x4_demote_f64x2_zero, f64x2_add, f64x2_mul, f64x2_pmax, f64x2_pmin, f64x2_promote_low_f32x4, f64x2_splat,
    f64x2_sub, i32x4_shuffle, v128, v128_load, v128_load64_zero, v128_store64_lane,
};

use crate::det_math::{det_sigmoid, tanh_in_place};

/// The parameter block JS writes once per world (`js/sim/wasm-brain.js`, `writeBrainParams`). Offsets are byte
/// offsets into the memory; layout offsets are element offsets within one slot's weight row.
#[repr(C)]
pub struct Params {
    alive: u32,
    weights: u32,
    hidden: u32,
    inputs: u32,
    pooled: u32,
    outputs: u32,
    leak: u32,
    fast_out: u32,
    ray_hue: u32,
    ray_cos: u32,
    ray_sin: u32,
    reward_scale: u32,
    scratch: u32,
    gene_index: u32,
    terms: u32,
    slots: u32,
    hidden_n: u32,
    input_count: u32,
    raw_input_count: u32,
    weight_count: u32,
    ray_count: u32,
    w_in: u32,
    w_rec: u32,
    b_hidden: u32,
    w_out: u32,
    b_out: u32,
    w_skip: u32,
    learn_gene: u32,
    output_count: u32,
    gene_count: u32,
    pooled_values: u32,
    extra_inputs: u32,
    split_index: u32,
    ray_channels: u32,
    pooled_channels: u32,
    hit_stride: u32,
    pooled_stride: u32,
    flags: u32,
    status_slot: i32,
    status_where: i32,
}

/// `flags` bit: Hebbian learning is on (`hebbianRate > 0`), so outputs read `fastOut` and `hebbianStep` runs.
const FLAG_LEARN: u32 = 1;
/// `flags` bit: `rewardedHebb` is on, so the rate is scaled by `reward_scale[slot]` (filled by JS before the call).
const FLAG_REWARDED: u32 = 2;

/// `status_where`: the non-finite value was a hidden unit's sum, an output's sum, or a slot's learn gene.
const AT_HIDDEN: i32 = 1;
const AT_OUTPUT: i32 = 2;
const AT_LEARN: i32 = 3;

const HEBB_DECAY: f64 = 0.01;
const HEBB_CLAMP: f64 = 4.0;

/// Typed pointers and sizes resolved from `Params`.
struct Brain {
    alive: *const u8,
    w: *const f32,
    hidden: *mut f32,
    inputs: *const f32,
    pooled: *mut f32,
    outputs: *mut f32,
    leak: *const f32,
    fast: *mut f32,
    hue: *const f32,
    cos: *const f64,
    sin: *const f64,
    reward: *const f64,
    gene_index: *const i32,
    /// Hidden sums (H), then gene sums (G), output sums (OUT), gene outputs (G), then the term values.
    acc: *mut f64,
    gacc: *mut f64,
    sums: *mut f64,
    gout: *mut f64,
    tx: *mut f64,
    /// Byte address of each term's weight row.
    trow: *mut u32,
    p: &'static Params,
}

/// A non-finite value where the JS throws: the slot, where, and the value.
struct Fault(usize, i32, f64);

#[inline(always)]
fn at<T>(base: u32) -> *mut T {
    base as usize as *mut T
}

impl Brain {
    /// # Safety
    /// `p` must describe arrays that lie inside the memory.
    unsafe fn new(p: &'static Params) -> Brain {
        let h = p.hidden_n as usize;
        let g = p.gene_count as usize;
        let out = p.output_count as usize;
        let acc: *mut f64 = at(p.scratch);
        // SAFETY: the arena sizes `scratch` for H + 2G + OUT + inputCount + H doubles.
        unsafe {
            Brain {
                alive: at(p.alive),
                w: at(p.weights),
                hidden: at(p.hidden),
                inputs: at(p.inputs),
                pooled: at(p.pooled),
                outputs: at(p.outputs),
                leak: at(p.leak),
                fast: at(p.fast_out),
                hue: at(p.ray_hue),
                cos: at(p.ray_cos),
                sin: at(p.ray_sin),
                reward: at(p.reward_scale),
                gene_index: at(p.gene_index),
                acc,
                gacc: acc.add(h),
                sums: acc.add(h + g),
                gout: acc.add(h + g + out),
                tx: acc.add(h + 2 * g + out),
                trow: at(p.terms),
                p,
            }
        }
    }
}

/// `poolRays`: the two strongest hits per channel, the two food hues, then the body block.
///
/// # Safety
/// `slot` is below `slots`.
#[inline(always)]
unsafe fn pool(b: &Brain, slot: usize) {
    let p = b.p;
    let (rc, rch, pv) = (p.ray_count as usize, p.ray_channels as usize, p.pooled_values as usize);
    let raw = slot * p.raw_input_count as usize;
    let out = slot * p.input_count as usize;
    let hue_start = out + pv - 2;
    // SAFETY: every index stays inside the slot's rows.
    unsafe {
        let pooled = b.pooled;
        for i in 0..pv {
            *pooled.add(out + i) = 0.0;
        }
        for k in 0..rc {
            let base = raw + k * rch;
            let proximity = *b.inputs.add(base);
            if proximity <= 0.0 {
                continue;
            }
            let mut c = usize::MAX;
            for ch in 0..p.pooled_channels as usize {
                if *b.inputs.add(base + 1 + ch) > 0.0 {
                    c = ch;
                    break;
                }
            }
            if c == usize::MAX {
                continue;
            }
            let first = out + c * p.pooled_stride as usize;
            let second = first + p.hit_stride as usize;
            if proximity > *pooled.add(first) {
                if c == 0 {
                    *pooled.add(hue_start + 1) = *pooled.add(hue_start);
                    *pooled.add(hue_start) = *b.hue.add(slot * rc + k);
                }
                *pooled.add(second) = *pooled.add(first);
                *pooled.add(second + 1) = *pooled.add(first + 1);
                *pooled.add(second + 2) = *pooled.add(first + 2);
                *pooled.add(first) = proximity;
                *pooled.add(first + 1) = *b.cos.add(k) as f32;
                *pooled.add(first + 2) = *b.sin.add(k) as f32;
            } else if proximity > *pooled.add(second) {
                if c == 0 {
                    *pooled.add(hue_start + 1) = *b.hue.add(slot * rc + k);
                }
                *pooled.add(second) = proximity;
                *pooled.add(second + 1) = *b.cos.add(k) as f32;
                *pooled.add(second + 2) = *b.sin.add(k) as f32;
            }
        }
        let body = raw + rc * rch;
        for i in 0..p.extra_inputs as usize {
            *pooled.add(out + pv + i) = *b.inputs.add(body + i);
        }
    }
}

/// Two `f32` at `ptr` widened to an `f64x2`.
#[inline(always)]
unsafe fn load2(ptr: *const f32) -> v128 {
    // SAFETY: the caller passes two readable floats.
    unsafe { f64x2_promote_low_f32x4(v128_load64_zero(ptr as *const u64)) }
}

/// `acc[j] = bias[j]`, then `acc[j] += row_t[j] * x_t` for each term t in order: the JS sums, unit by unit. Eight units
/// share one pass over the terms in four `f64x2` lanes, then pairs, then one.
///
/// # Safety
/// `acc` and `bias` hold `units` values; each `trow[t]` addresses a row of at least `units` floats.
#[inline(always)]
unsafe fn accumulate(acc: *mut f64, bias: *const f32, units: usize, tx: *const f64, trow: *const u32, nt: usize) {
    let mut j = 0;
    // SAFETY: as documented; every row read is inside its row.
    unsafe {
        while j + 8 <= units {
            let mut a0 = load2(bias.add(j));
            let mut a1 = load2(bias.add(j + 2));
            let mut a2 = load2(bias.add(j + 4));
            let mut a3 = load2(bias.add(j + 6));
            for t in 0..nt {
                let x = f64x2_splat(*tx.add(t));
                let row = (*trow.add(t) as usize as *const f32).add(j);
                let lo = v128_load(row as *const v128);
                let hi = v128_load(row.add(4) as *const v128);
                a0 = f64x2_add(a0, f64x2_mul(f64x2_promote_low_f32x4(lo), x));
                a1 = f64x2_add(
                    a1,
                    f64x2_mul(f64x2_promote_low_f32x4(i32x4_shuffle::<2, 3, 2, 3>(lo, lo)), x),
                );
                a2 = f64x2_add(a2, f64x2_mul(f64x2_promote_low_f32x4(hi), x));
                a3 = f64x2_add(
                    a3,
                    f64x2_mul(f64x2_promote_low_f32x4(i32x4_shuffle::<2, 3, 2, 3>(hi, hi)), x),
                );
            }
            (acc.add(j) as *mut v128).write_unaligned(a0);
            (acc.add(j + 2) as *mut v128).write_unaligned(a1);
            (acc.add(j + 4) as *mut v128).write_unaligned(a2);
            (acc.add(j + 6) as *mut v128).write_unaligned(a3);
            j += 8;
        }
        while j + 2 <= units {
            let mut a = load2(bias.add(j));
            for t in 0..nt {
                let row = (*trow.add(t) as usize as *const f32).add(j);
                a = f64x2_add(a, f64x2_mul(load2(row), f64x2_splat(*tx.add(t))));
            }
            (acc.add(j) as *mut v128).write_unaligned(a);
            j += 2;
        }
        if j < units {
            let mut a = *bias.add(j) as f64;
            for t in 0..nt {
                a += *(*trow.add(t) as usize as *const f32).add(j) as f64 * *tx.add(t);
            }
            *acc.add(j) = a;
        }
    }
}

/// `hiddenStep`: the new hidden row into the scratch row, from the bias, the nonzero inputs and the old row.
///
/// # Safety
/// `slot` is below `slots`.
#[inline(always)]
unsafe fn hidden_step(b: &Brain, slot: usize) -> Result<(), Fault> {
    let p = b.p;
    let h = p.hidden_n as usize;
    let ic = p.input_count as usize;
    let w_slot = slot * p.weight_count as usize;
    let h_base = slot * h;
    // SAFETY: every index stays inside the slot's rows and the scratch.
    unsafe {
        let w_in = b.w.add(w_slot + p.w_in as usize);
        let w_rec = b.w.add(w_slot + p.w_rec as usize);
        let mut nt = 0;
        for i in 0..ic {
            let x = *b.pooled.add(slot * ic + i);
            if x == 0.0 {
                continue;
            }
            *b.tx.add(nt) = x as f64;
            *b.trow.add(nt) = w_in.add(i * h) as usize as u32;
            nt += 1;
        }
        for k in 0..h {
            *b.tx.add(nt) = *b.hidden.add(h_base + k) as f64;
            *b.trow.add(nt) = w_rec.add(k * h) as usize as u32;
            nt += 1;
        }
        accumulate(b.acc, b.w.add(w_slot + p.b_hidden as usize), h, b.tx, b.trow, nt);
        let bad = tanh_in_place(b.acc, h);
        if bad != 0 {
            return Err(Fault(slot, AT_HIDDEN, *b.acc.add(bad - 1)));
        }
        let scratch_row = p.slots as usize * h;
        for j in 0..h {
            let a = *b.leak.add(h_base + j) as f64;
            let old = *b.hidden.add(h_base + j) as f64;
            *b.hidden.add(scratch_row + j) = ((1.0 - a) * old + a * *b.acc.add(j)) as f32;
        }
    }
    Ok(())
}

/// `outputStep` with `addSkip`: the outputs from the new hidden row and the skip block, then the row is committed.
///
/// # Safety
/// `slot` is below `slots`.
#[inline(always)]
unsafe fn output_step(b: &Brain, slot: usize) -> Result<(), Fault> {
    let p = b.p;
    let (h, g, out) = (p.hidden_n as usize, p.gene_count as usize, p.output_count as usize);
    let ic = p.input_count as usize;
    let w_slot = slot * p.weight_count as usize;
    let scratch_row = p.slots as usize * h;
    // SAFETY: every index stays inside the slot's rows and the scratch.
    unsafe {
        let block = if p.flags & FLAG_LEARN != 0 {
            b.fast.add(slot * h * g)
        } else {
            b.w.add(w_slot + p.w_out as usize)
        };
        let mut nt = 0;
        for j in 0..h {
            *b.tx.add(nt) = *b.hidden.add(scratch_row + j) as f64;
            *b.trow.add(nt) = block.add(j * g) as usize as u32;
            nt += 1;
        }
        let skip = b.w.add(w_slot + p.w_skip as usize);
        for i in 0..p.pooled_values as usize {
            let x = *b.pooled.add(slot * ic + i);
            if x == 0.0 {
                continue;
            }
            *b.tx.add(nt) = x as f64;
            *b.trow.add(nt) = skip.add(i * g) as usize as u32;
            nt += 1;
        }
        accumulate(b.gacc, b.w.add(w_slot + p.b_out as usize), g, b.tx, b.trow, nt);
        *b.sums.add(p.split_index as usize) = 0.0;
        for k in 0..g {
            *b.sums.add(*b.gene_index.add(k) as usize) = *b.gacc.add(k);
        }
        let bad = tanh_in_place(b.sums, out);
        if bad != 0 {
            return Err(Fault(slot, AT_OUTPUT, *b.sums.add(bad - 1)));
        }
        for o in 0..out {
            *b.outputs.add(slot * out + o) = *b.sums.add(o) as f32;
        }
        for j in 0..h {
            *b.hidden.add(slot * h + j) = *b.hidden.add(scratch_row + j);
        }
    }
    Ok(())
}

/// One plastic weight pair: `f + eta (h out - HEBB_DECAY (f - w))`, clamped to plus or minus `HEBB_CLAMP`.
#[inline(always)]
fn hebb2(f: v128, w: v128, h_out: v128, eta: v128) -> v128 {
    let next = f64x2_add(
        f,
        f64x2_mul(
            eta,
            f64x2_sub(h_out, f64x2_mul(f64x2_splat(HEBB_DECAY), f64x2_sub(f, w))),
        ),
    );
    // pmin(x, c) is `c < x ? c : x` and pmax(x, -c) is `x < -c ? -c : x`: the JS ternaries, NaN passing through.
    f64x2_pmax(f64x2_pmin(next, f64x2_splat(HEBB_CLAMP)), f64x2_splat(-HEBB_CLAMP))
}

/// `hebbianStep`: the slot's plastic block drifts toward `h out` and back toward the genome.
///
/// # Safety
/// `slot` is below `slots`, and learning is on.
#[inline(always)]
unsafe fn hebbian_step(b: &Brain, slot: usize, rate: f64) -> Result<(), Fault> {
    let p = b.p;
    let (h, g, out) = (p.hidden_n as usize, p.gene_count as usize, p.output_count as usize);
    let w_slot = slot * p.weight_count as usize;
    // SAFETY: every index stays inside the slot's rows and the scratch.
    unsafe {
        let learn = *b.w.add(w_slot + p.learn_gene as usize) as f64;
        if !learn.is_finite() {
            return Err(Fault(slot, AT_LEARN, learn));
        }
        let mut eta = rate * det_sigmoid(learn);
        if p.flags & FLAG_REWARDED != 0 {
            eta *= *b.reward.add(slot);
        }
        for k in 0..g {
            *b.gout.add(k) = *b.outputs.add(slot * out + *b.gene_index.add(k) as usize) as f64;
        }
        let genome = b.w.add(w_slot + p.w_out as usize);
        let fast = b.fast.add(slot * h * g);
        let eta2 = f64x2_splat(eta);
        for j in 0..h {
            let hv = *b.hidden.add(slot * h + j) as f64;
            let h2 = f64x2_splat(hv);
            let row = j * g;
            let mut k = 0;
            while k + 2 <= g {
                let h_out = f64x2_mul(h2, (b.gout.add(k) as *const v128).read_unaligned());
                let next = hebb2(load2(fast.add(row + k)), load2(genome.add(row + k)), h_out, eta2);
                v128_store64_lane::<0>(f32x4_demote_f64x2_zero(next), fast.add(row + k) as *mut u64);
                k += 2;
            }
            if k < g {
                let f = *fast.add(row + k) as f64;
                let next = f + eta * (hv * *b.gout.add(k) - HEBB_DECAY * (f - *genome.add(row + k) as f64));
                let clamped = if next > HEBB_CLAMP {
                    HEBB_CLAMP
                } else if next < -HEBB_CLAMP {
                    -HEBB_CLAMP
                } else {
                    next
                };
                *fast.add(row + k) = clamped as f32;
            }
        }
    }
    Ok(())
}

/// Runs the brain of every alive slot, ascending. Returns 0, or 1 after writing the faulting slot and place to
/// `status_slot` and `status_where` and the non-finite value to `doubles[1]`.
///
/// # Safety
/// `params` addresses a `Params` block and `doubles` two or more doubles (`doubles[0]` is `hebbianRate`), and every
/// array they describe lies inside the memory.
pub unsafe fn forward_all(params: u32, doubles: u32) -> i32 {
    // SAFETY: as documented.
    unsafe {
        let p: &'static mut Params = &mut *at::<Params>(params);
        let d: *mut f64 = at(doubles);
        let rate = *d;
        let learn = p.flags & FLAG_LEARN != 0;
        let result = {
            let b = Brain::new(&*(p as *const Params));
            let mut result = Ok(());
            for slot in 0..b.p.slots as usize {
                if *b.alive.add(slot) != 1 {
                    continue;
                }
                pool(&b, slot);
                result = hidden_step(&b, slot).and_then(|()| output_step(&b, slot));
                if result.is_ok() && learn {
                    result = hebbian_step(&b, slot, rate);
                }
                if result.is_err() {
                    break;
                }
            }
            result
        };
        match result {
            Ok(()) => {
                p.status_slot = -1;
                p.status_where = 0;
                0
            }
            Err(Fault(slot, place, value)) => {
                p.status_slot = slot as i32;
                p.status_where = place;
                *d.add(1) = value;
                1
            }
        }
    }
}
