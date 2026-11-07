//! The spatial hash build (`buildHash`, formerly in `js/sim/spatial-hash.js`): a counting sort of every live circle
//! into the uniform grid's cells, agents by ascending slot (id `slot`), then food (id `maxAgents + slot`).
//!
//! Bit-identity rules (docs/designs/wasm-kernels.md): each `f32` position and radius widens to `f64` before the
//! subtraction or addition, `Math.floor(v / cellSize)` is the IEEE division and floor, and the clamp maps NaN to cell 0
//! as the JS store into an `Int32Array` did. The entries of a cell keep the insertion order, so every reader of the hash
//! (the ray march, the contact pass, feeding, mating, calls, disease) sees the cells exactly as before.

use core::arch::wasm32::{v128, v128_any_true};

use crate::det_math::floor;

/// The parameter block JS writes (`js/sim/wasm-hash.js`, `writeHashParams`): byte offsets of the arrays, then sizes.
#[repr(C)]
pub struct HashParams {
    alive: u32,
    x: u32,
    y: u32,
    size: u32,
    food_alive: u32,
    food_x: u32,
    food_y: u32,
    food_radius: u32,
    cell_start: u32,
    cell_count: u32,
    entries: u32,
    box_x: u32,
    box_y: u32,
    circle_range: u32,
    max_agents: u32,
    max_food: u32,
    cols: u32,
    rows: u32,
    capacity: u32,
}

#[inline(always)]
fn at<T>(base: u32) -> *mut T {
    base as usize as *mut T
}

/// `cellOf` after its division and floor: the clamped cell coordinate; NaN lands in cell 0, as the JS `Int32Array`
/// store did.
#[inline(always)]
fn clamp_cell(c: f64, last: i32) -> i32 {
    if c < 0.0 {
        0
    } else if c > last as f64 {
        last
    } else {
        c as i32
    }
}

/// Calls `f(i)` for every `i` below `n` with `alive[i] == 1`, ascending. Sixteen bytes that are all 0 are skipped with
/// one vector test, so a sparse array (a drill world's 3600 food slots) costs a sixteenth of a byte loop.
///
/// # Safety
/// `alive` points at `n` readable bytes.
#[inline(always)]
unsafe fn for_each_live(alive: *const u8, n: usize, mut f: impl FnMut(usize)) {
    let mut i = 0;
    // SAFETY: every load reads bytes below `n`.
    unsafe {
        while i + 16 <= n {
            if v128_any_true((alive.add(i) as *const v128).read_unaligned()) {
                for j in i..i + 16 {
                    if *alive.add(j) == 1 {
                        f(j);
                    }
                }
            }
            i += 16;
        }
        while i < n {
            if *alive.add(i) == 1 {
                f(i);
            }
            i += 1;
        }
    }
}

/// The grid and its scratch, resolved from `HashParams`.
struct Grid {
    cols: i32,
    last_col: i32,
    last_row: i32,
    cell_size: f64,
    counts: *mut i32,
    ranges: *mut i32,
}

impl Grid {
    /// `cellRange` and `countRange`: counts circle `id` into every cell its box covers and keeps the range.
    ///
    /// # Safety
    /// `id` is below `maxAgents + maxFood`, so its four range words and every cell it counts are inside the arrays.
    #[inline(always)]
    unsafe fn count(&self, id: usize, x: f64, y: f64, r: f64) {
        let cs = self.cell_size;
        let c0 = clamp_cell(floor((x - r) / cs), self.last_col);
        let r0 = clamp_cell(floor((y - r) / cs), self.last_row);
        let c1 = clamp_cell(floor((x + r) / cs), self.last_col);
        let r1 = clamp_cell(floor((y + r) / cs), self.last_row);
        // SAFETY: as documented above.
        unsafe {
            let range = self.ranges.add(4 * id);
            *range = c0;
            *range.add(1) = r0;
            *range.add(2) = c1;
            *range.add(3) = r1;
            for row in r0..=r1 {
                let base = self.counts.add((row * self.cols) as usize);
                for col in c0..=c1 {
                    *base.add(col as usize) += 1;
                }
            }
        }
    }
}

/// The insert pass's outputs: `entries`, the boxes, and the cursors (the counts array, reused).
struct Insert {
    cols: i32,
    cursor: *mut i32,
    ranges: *const i32,
    entries: *mut i32,
    box_x: *mut f64,
    box_y: *mut f64,
}

impl Insert {
    /// `insertRange`: writes circle `id` into every cell of the range the count pass kept, with its box minimum.
    ///
    /// # Safety
    /// The count pass counted `id` and the total fits the entries, so every cursor stays inside its cell's span.
    #[inline(always)]
    unsafe fn insert(&self, id: usize, min_x: f64, min_y: f64) {
        // SAFETY: as documented above.
        unsafe {
            let range = self.ranges.add(4 * id);
            let (c0, r0, c1, r1) = (*range, *range.add(1), *range.add(2), *range.add(3));
            for row in r0..=r1 {
                let base = self.cursor.add((row * self.cols) as usize);
                for col in c0..=c1 {
                    let cur = base.add(col as usize);
                    let e = *cur as usize;
                    *cur += 1;
                    *self.entries.add(e) = id as i32;
                    *self.box_x.add(e) = min_x;
                    *self.box_y.add(e) = min_y;
                }
            }
        }
    }
}

/// Counts every live circle, agents then food (`countAll`).
///
/// # Safety
/// `p` describes arrays inside the memory.
unsafe fn count_all(p: &HashParams, g: &Grid) {
    // SAFETY: each array holds `maxAgents` or `maxFood` entries, read below those counts.
    unsafe {
        let (alive, x, y, size) = (at::<u8>(p.alive), at::<f32>(p.x), at::<f32>(p.y), at::<f32>(p.size));
        for_each_live(alive, p.max_agents as usize, |i| {
            g.count(i, *x.add(i) as f64, *y.add(i) as f64, *size.add(i) as f64);
        });
        let (fa, fx, fy, fr) = (
            at::<u8>(p.food_alive),
            at::<f32>(p.food_x),
            at::<f32>(p.food_y),
            at::<f32>(p.food_radius),
        );
        let base = p.max_agents as usize;
        for_each_live(fa, p.max_food as usize, |i| {
            g.count(base + i, *fx.add(i) as f64, *fy.add(i) as f64, *fr.add(i) as f64);
        });
    }
}

/// Inserts every live circle in the order `count_all` counted them (`insertAll`).
///
/// # Safety
/// `count_all` ran on the same state and the total fits the entries.
unsafe fn insert_all(p: &HashParams, ins: &Insert) {
    // SAFETY: as for `count_all`; the box minimum is the JS `x[i] - size[i]` in double.
    unsafe {
        let (alive, x, y, size) = (at::<u8>(p.alive), at::<f32>(p.x), at::<f32>(p.y), at::<f32>(p.size));
        for_each_live(alive, p.max_agents as usize, |i| {
            let r = *size.add(i) as f64;
            ins.insert(i, *x.add(i) as f64 - r, *y.add(i) as f64 - r);
        });
        let (fa, fx, fy, fr) = (
            at::<u8>(p.food_alive),
            at::<f32>(p.food_x),
            at::<f32>(p.food_y),
            at::<f32>(p.food_radius),
        );
        let base = p.max_agents as usize;
        for_each_live(fa, p.max_food as usize, |i| {
            let r = *fr.add(i) as f64;
            ins.insert(base + i, *fx.add(i) as f64 - r, *fy.add(i) as f64 - r);
        });
    }
}

/// Rebuilds the hash: writes `cellStart` and, when the entries fit, `entries`, `boxX` and `boxY`. Returns the entry
/// total; a total above `capacity` means nothing was inserted and JS throws.
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-hash.js` wrote, describing arrays inside the memory.
pub unsafe fn build(params: u32, cell_size: f64) -> i32 {
    // SAFETY: the caller passes the arena's hash parameter block; every index below stays inside the arrays it sizes.
    unsafe {
        let p = &*(params as usize as *const HashParams);
        let cells = (p.cols * p.rows) as usize;
        let counts = at::<i32>(p.cell_count);
        core::ptr::write_bytes(counts, 0, cells);
        let g = Grid {
            cols: p.cols as i32,
            last_col: p.cols as i32 - 1,
            last_row: p.rows as i32 - 1,
            cell_size,
            counts,
            ranges: at::<i32>(p.circle_range),
        };
        count_all(p, &g);
        // The prefix sum gives each cell's start; the counts become the insert cursors, starting at those starts.
        let starts = at::<i32>(p.cell_start);
        let mut sum = 0i32;
        *starts = 0;
        for c in 0..cells {
            let n = *counts.add(c);
            *counts.add(c) = sum;
            sum += n;
            *starts.add(c + 1) = sum;
        }
        if sum as u32 > p.capacity {
            return sum;
        }
        let ins = Insert {
            cols: g.cols,
            cursor: counts,
            ranges: g.ranges,
            entries: at::<i32>(p.entries),
            box_x: at::<f64>(p.box_x),
            box_y: at::<f64>(p.box_y),
        };
        insert_all(p, &ins);
        sum
    }
}
