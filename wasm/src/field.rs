//! The pheromone update of the field phase (`updatePheromones`, formerly the JS `updateGrid` in
//! `js/sim/pheromones.js`): each of the danger, attack and hunt grids decays, is copied to the scratch, then diffuses
//! to its four in-grid neighbours.
//!
//! Bit-identity rules (docs/designs/wasm-kernels.md): every cell is computed in `f64` from its `f32` values with the JS
//! operations in the JS order and rounded to `f32` once, at the store (`Math.fround`). SIMD is vertical only: each lane
//! is one cell with its own chain of the same operations; promotion to `f64` is exact and demotion rounds to nearest
//! even as `Math.fround` does.

use core::arch::wasm32::{
    f32x4_demote_f64x2_zero, f64x2_add, f64x2_mul, f64x2_promote_low_f32x4, f64x2_splat, f64x2_sub, i32x4_shuffle,
    v128, v128_load, v128_store,
};

/// The parameter block JS writes (`js/sim/wasm-field.js`, `writeFieldParams`): byte offsets, then the grid shape.
#[repr(C)]
pub struct FieldParams {
    danger: u32,
    attack: u32,
    hunt: u32,
    scratch: u32,
    cols: u32,
    rows: u32,
}

#[inline(always)]
fn at<T>(base: u32) -> *mut T {
    base as usize as *mut T
}

/// The two `f64` halves of four `f32` cells.
#[inline(always)]
fn widen(v: v128) -> (v128, v128) {
    (
        f64x2_promote_low_f32x4(v),
        f64x2_promote_low_f32x4(i32x4_shuffle::<2, 3, 0, 1>(v, v)),
    )
}

/// Four `f32` cells from two `f64` halves, each rounded once.
#[inline(always)]
fn narrow(lo: v128, hi: v128) -> v128 {
    i32x4_shuffle::<0, 1, 4, 5>(f32x4_demote_f64x2_zero(lo), f32x4_demote_f64x2_zero(hi))
}

/// The grid shape and rates of one update.
struct Grid {
    s: *mut f32,
    cols: usize,
    rows: usize,
    k: f64,
    k4: f64,
}

impl Grid {
    /// `diffuseCell`: the cell's value after diffusion, for a cell with any number of in-grid neighbours.
    ///
    /// # Safety
    /// `c` is a cell of the grid.
    #[inline(always)]
    unsafe fn edge_cell(&self, c: usize) -> f32 {
        let (cols, rows, s) = (self.cols, self.rows, self.s);
        let col = c % cols;
        let row = c / cols;
        // SAFETY: each neighbour is read only when it is inside the grid.
        unsafe {
            let v = *s.add(c) as f64;
            let mut sum = 0.0f64;
            sum += if col > 0 { *s.add(c - 1) as f64 } else { 0.0 };
            sum += if col < cols - 1 { *s.add(c + 1) as f64 } else { 0.0 };
            sum += if row > 0 { *s.add(c - cols) as f64 } else { 0.0 };
            sum += if row < rows - 1 { *s.add(c + cols) as f64 } else { 0.0 };
            let n = (col > 0) as u32 + (col < cols - 1) as u32 + (row > 0) as u32 + (row < rows - 1) as u32;
            (v - self.k * n as f64 * v + self.k * sum) as f32
        }
    }

    /// A cell with four in-grid neighbours: the same terms, in the same order, as `edge_cell`'s JS twin.
    ///
    /// # Safety
    /// `c` is an interior cell.
    #[inline(always)]
    unsafe fn inner_cell(&self, c: usize) -> f32 {
        let (cols, s) = (self.cols, self.s);
        // SAFETY: an interior cell has all four neighbours.
        unsafe {
            let v = *s.add(c) as f64;
            let sum = *s.add(c - 1) as f64 + *s.add(c + 1) as f64 + *s.add(c - cols) as f64 + *s.add(c + cols) as f64;
            (v - self.k4 * v + self.k * sum) as f32
        }
    }

    /// Four interior cells from `c`: `inner_cell` in each lane.
    ///
    /// # Safety
    /// `c..c + 4` are interior cells.
    #[inline(always)]
    unsafe fn inner4(&self, c: usize) -> v128 {
        let (cols, s) = (self.cols, self.s);
        // SAFETY: as documented above; the loads are unaligned `v128` loads of four cells.
        unsafe {
            let load = |p: *const f32| widen(v128_load(p as *const v128));
            let (v0, v1) = load(s.add(c));
            let (l0, l1) = load(s.add(c - 1));
            let (r0, r1) = load(s.add(c + 1));
            let (u0, u1) = load(s.add(c - cols));
            let (d0, d1) = load(s.add(c + cols));
            let (k, k4) = (f64x2_splat(self.k), f64x2_splat(self.k4));
            let lane = |v: v128, l: v128, r: v128, u: v128, d: v128| {
                let sum = f64x2_add(f64x2_add(f64x2_add(l, r), u), d);
                f64x2_add(f64x2_sub(v, f64x2_mul(k4, v)), f64x2_mul(k, sum))
            };
            narrow(lane(v0, l0, r0, u0, d0), lane(v1, l1, r1, u1, d1))
        }
    }
}

/// Decays every cell and copies it to the scratch (the first loop of `updateGrid`).
///
/// # Safety
/// `grid` and `s` hold `n` cells.
unsafe fn decay(grid: *mut f32, s: *mut f32, n: usize, keep: f64) {
    // SAFETY: every index is below `n`.
    unsafe {
        let kv = f64x2_splat(keep);
        let mut c = 0;
        while c + 4 <= n {
            let (lo, hi) = widen(v128_load(grid.add(c) as *const v128));
            let out = narrow(f64x2_mul(lo, kv), f64x2_mul(hi, kv));
            v128_store(grid.add(c) as *mut v128, out);
            v128_store(s.add(c) as *mut v128, out);
            c += 4;
        }
        while c < n {
            let v = (*grid.add(c) as f64 * keep) as f32;
            *grid.add(c) = v;
            *s.add(c) = v;
            c += 1;
        }
    }
}

/// Diffuses the decayed copy back into the grid (the second loop of `updateGrid`).
///
/// # Safety
/// `grid` and `g.s` hold `cols * rows` cells.
unsafe fn diffuse(grid: *mut f32, g: &Grid) {
    let (cols, rows) = (g.cols, g.rows);
    // SAFETY: every index is a cell of the grid; `inner4` reads only interior cells and their neighbours.
    unsafe {
        for row in 0..rows {
            let start = row * cols;
            let end = start + cols;
            if row == 0 || row == rows - 1 || cols < 3 {
                for c in start..end {
                    *grid.add(c) = g.edge_cell(c);
                }
                continue;
            }
            *grid.add(start) = g.edge_cell(start);
            let mut c = start + 1;
            while c + 4 <= end - 1 {
                v128_store(grid.add(c) as *mut v128, g.inner4(c));
                c += 4;
            }
            while c < end - 1 {
                *grid.add(c) = g.inner_cell(c);
                c += 1;
            }
            *grid.add(end - 1) = g.edge_cell(end - 1);
        }
    }
}

/// Decays then diffuses the danger, attack and hunt grids (`updatePheromones`).
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-field.js` wrote, describing arrays inside the memory.
pub unsafe fn update_pheromones(params: u32, decay_rate: f64, diffusion: f64) {
    // SAFETY: the caller passes the arena's field parameter block; each grid and the scratch hold `cols * rows` cells.
    unsafe {
        let p = &*(params as usize as *const FieldParams);
        let k = diffusion / 4.0;
        let g = Grid {
            s: at::<f32>(p.scratch),
            cols: p.cols as usize,
            rows: p.rows as usize,
            k,
            k4: k * 4.0,
        };
        let n = g.cols * g.rows;
        let keep = 1.0 - decay_rate;
        for grid in [p.danger, p.attack, p.hunt] {
            decay(at::<f32>(grid), g.s, n, keep);
            diffuse(at::<f32>(grid), &g);
        }
    }
}
