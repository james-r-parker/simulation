//! The pheromone update of the field phase (`updatePheromones`, formerly the JS `updateGrid` in
//! `js/sim/pheromones.js`): each of the danger, attack, hunt and mate grids decays, is copied to the scratch, then diffuses
//! to its four in-grid neighbours. The two loops run row by row, and rows of exact zeros are skipped (`update_grid`).
//!
//! Bit-identity rules (docs/designs/wasm-kernels.md): every cell is computed in `f64` from its `f32` values with the JS
//! operations in the JS order and rounded to `f32` once, at the store (`Math.fround`). SIMD is vertical only: each lane
//! is one cell with its own chain of the same operations; promotion to `f64` is exact and demotion rounds to nearest
//! even as `Math.fround` does.

use core::arch::wasm32::{
    f32x4_demote_f64x2_zero, f64x2_add, f64x2_mul, f64x2_promote_low_f32x4, f64x2_splat, f64x2_sub, i32x4_shuffle,
    v128, v128_any_true, v128_load, v128_store,
};

/// The parameter block JS writes (`js/sim/wasm-field.js`, `writeFieldParams`): byte offsets, then the grid shape.
#[repr(C)]
pub struct FieldParams {
    danger: u32,
    attack: u32,
    hunt: u32,
    mate: u32,
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

/// True when the `n` cells at `row` are all `+0` (every bit clear); stops at the first nonzero group of four.
///
/// # Safety
/// `row` holds `n` cells.
#[inline(always)]
unsafe fn all_zero(row: *const f32, n: usize) -> bool {
    // SAFETY: every index is below `n`.
    unsafe {
        let mut c = 0;
        while c + 4 <= n {
            if v128_any_true(v128_load(row.add(c) as *const v128)) {
                return false;
            }
            c += 4;
        }
        while c < n {
            if (*row.add(c)).to_bits() != 0 {
                return false;
            }
            c += 1;
        }
        true
    }
}

/// Decays one row of cells and copies it to the scratch (the first loop of `updateGrid`, one row of it). A row of `+0`
/// cells decays to itself, so only its scratch row is written (0). Returns whether the row was all `+0`.
///
/// # Safety
/// `grid` and `s` hold the `n` cells from `start`.
#[inline(always)]
unsafe fn decay_row(grid: *mut f32, s: *mut f32, start: usize, n: usize, keep: f64) -> bool {
    // SAFETY: every index is below `start + n`.
    unsafe {
        let (grid, s) = (grid.add(start), s.add(start));
        if all_zero(grid, n) {
            core::ptr::write_bytes(s, 0, n);
            return true;
        }
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
        false
    }
}

/// Diffuses one row of the decayed copy back into the grid (the second loop of `updateGrid`, one row of it).
///
/// # Safety
/// `grid` and `g.s` hold `cols * rows` cells, `row` is below `rows`, and the scratch rows around it are decayed.
#[inline(always)]
unsafe fn diffuse_row(grid: *mut f32, g: &Grid, row: usize) {
    let (cols, rows) = (g.cols, g.rows);
    let start = row * cols;
    let end = start + cols;
    // SAFETY: every index is a cell of the grid; `inner4` reads only interior cells and their neighbours.
    unsafe {
        if row == 0 || row == rows - 1 || cols < 3 {
            for c in start..end {
                *grid.add(c) = g.edge_cell(c);
            }
            return;
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

/// Decays then diffuses one grid, row by row: row r + 1 decays before row r diffuses, which reads scratch rows r - 1 to
/// r + 1 only, so every cell gets the values the two whole-grid loops gave it. A row whose own and neighbouring rows were
/// all `+0` is skipped: each of its cells diffuses `+0` terms to `+0`, the value it already holds. The scratch ends as
/// the decayed grid, as before.
///
/// # Safety
/// `grid` and `g.s` hold `cols * rows` cells.
unsafe fn update_grid(grid: *mut f32, g: &Grid, keep: f64) {
    let (cols, rows) = (g.cols, g.rows);
    // SAFETY: every row index is below `rows`.
    unsafe {
        let mut zero_prev = true;
        let mut zero_cur = decay_row(grid, g.s, 0, cols, keep);
        for row in 0..rows {
            let zero_next = row + 1 >= rows || decay_row(grid, g.s, (row + 1) * cols, cols, keep);
            if !(zero_prev && zero_cur && zero_next) {
                diffuse_row(grid, g, row);
            }
            zero_prev = zero_cur;
            zero_cur = zero_next;
        }
    }
}

/// Decays then diffuses the danger, attack, hunt and mate grids (`updatePheromones`).
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
        let keep = 1.0 - decay_rate;
        if g.cols == 0 || g.rows == 0 {
            return;
        }
        for grid in [p.danger, p.attack, p.hunt, p.mate] {
            update_grid(at::<f32>(grid), &g, keep);
        }
    }
}
