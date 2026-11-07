//! The physics phase's numeric loops (formerly in `js/sim/physics.js`): the damping, speed cap and move of every agent
//! (`moveAgent`), the geometry of one agent's rock bounces (`bounceObstacles`, resumable after each damaging impact so
//! JS applies the damage rule), and the contact pass over the spatial hash with the final clamp (`resolveContacts`).
//!
//! Bit-identity rules (docs/designs/wasm-kernels.md): every value is computed in `f64` with the JS operations in the JS
//! order, each `f32` world value widens before use and is rounded once where JS stores it (`Math.fround`), `Math.sqrt`
//! and `Math.floor` are the IEEE instructions, and pairs are resolved in the JS order, each applied before the next is
//! examined. The rules that touch energy (wall and rock damage, trampling) stay in JS.

use crate::det_math::floor;
use core::arch::wasm32::{
    f64x2_abs, f64x2_add, f64x2_extract_lane, f64x2_lt, f64x2_promote_low_f32x4, f64x2_splat, f64x2_sqrt, f64x2_sub,
    v128_and, v128_any_true, v128_load64_zero,
};

/// The parameter block JS writes (`js/sim/wasm-physics.js`, `writePhysicsParams`): byte offsets, then sizes.
#[repr(C)]
pub struct PhysicsParams {
    alive: u32,
    x: u32,
    y: u32,
    vx: u32,
    vy: u32,
    size: u32,
    spec: u32,
    outputs: u32,
    sprint_by_spec: u32,
    obs_x: u32,
    obs_y: u32,
    obs_radius: u32,
    cell_start: u32,
    entries: u32,
    box_x: u32,
    box_y: u32,
    contacts: u32,
    doubles: u32,
    max_agents: u32,
    obs_count: u32,
    output_count: u32,
    sprint_output: u32,
    cols: u32,
    rows: u32,
    max_contacts: u32,
}

/// Indices into the doubles block.
const D_DAMPING: usize = 0;
const D_MAX_VELOCITY: usize = 1;
const D_SPRINT_MULTIPLIER: usize = 2;
const D_RESTITUTION: usize = 3;
const D_WIDTH: usize = 4;
const D_HEIGHT: usize = 5;
const D_CELL_SIZE: usize = 6;

#[inline(always)]
fn at<T>(base: u32) -> *mut T {
    base as usize as *mut T
}

/// `Math.sqrt`: the IEEE square root.
#[inline(always)]
fn sqrt(x: f64) -> f64 {
    f64x2_extract_lane::<0>(f64x2_sqrt(f64x2_splat(x)))
}

/// `Math.abs`: the sign bit cleared.
#[inline(always)]
fn abs(x: f64) -> f64 {
    f64::from_bits(x.to_bits() & !(1u64 << 63))
}

/// `Math.max` of two doubles: NaN if either is, +0 over -0.
#[inline(always)]
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else if b > a {
        b
    } else if a.is_sign_negative() {
        b
    } else {
        a
    }
}

/// `Math.min` of two doubles: NaN if either is, -0 over +0.
#[inline(always)]
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else if b < a {
        b
    } else if a.is_sign_negative() {
        a
    } else {
        b
    }
}

/// `cellOf`: the clamped cell coordinate of a world coordinate.
#[inline(always)]
fn cell_of(v: f64, cell_size: f64, last: u32) -> u32 {
    let c = floor(v / cell_size);
    if c < 0.0 {
        0
    } else if c > last as f64 {
        last
    } else {
        c as u32
    }
}

/// Typed pointers resolved from `PhysicsParams`.
struct Bodies {
    x: *mut f32,
    y: *mut f32,
    vx: *mut f32,
    vy: *mut f32,
    size: *const f32,
    d: *const f64,
    p: &'static PhysicsParams,
}

impl Bodies {
    /// # Safety
    /// `params` addresses the block JS wrote, describing arrays inside the memory.
    unsafe fn new(params: u32) -> Bodies {
        // SAFETY: as documented above.
        let p = unsafe { &*(params as usize as *const PhysicsParams) };
        Bodies {
            x: at(p.x),
            y: at(p.y),
            vx: at(p.vx),
            vy: at(p.vy),
            size: at(p.size),
            d: at(p.doubles),
            p,
        }
    }

    #[inline(always)]
    unsafe fn dbl(&self, i: usize) -> f64 {
        // SAFETY: the doubles block holds every `D_*` index.
        unsafe { *self.d.add(i) }
    }

    #[inline(always)]
    unsafe fn get(a: *const f32, i: usize) -> f64 {
        // SAFETY: the callers index below `maxAgents`.
        unsafe { *a.add(i) as f64 }
    }

    #[inline(always)]
    unsafe fn put(a: *mut f32, i: usize, v: f64) {
        // SAFETY: the callers index below `maxAgents`.
        unsafe { *a.add(i) = v as f32 }
    }

    /// `moveAgent`: damping, the speed cap (raised while sprinting) and the move of one agent.
    unsafe fn move_agent(&self, i: usize, damping: f64, max_v: f64, sprint_mul: f64) {
        let p = self.p;
        // SAFETY: `i` is an agent slot, its output row and spec entry exist, and the spec indexes the table.
        unsafe {
            let (x, y, vx, vy) = (self.x, self.y, self.vx, self.vy);
            Self::put(vx, i, Self::get(vx, i) * damping);
            Self::put(vy, i, Self::get(vy, i) * damping);
            let sprint = *at::<f32>(p.outputs).add(i * p.output_count as usize + p.sprint_output as usize);
            let boost = *at::<f64>(p.sprint_by_spec).add(*at::<u8>(p.spec).add(i) as usize);
            let cap = if sprint > 0.0 {
                max_v * (1.0 + sprint_mul * boost)
            } else {
                max_v
            };
            let (a, b) = (Self::get(vx, i), Self::get(vy, i));
            let speed = sqrt(a * a + b * b);
            if speed > cap {
                let s = cap / speed;
                Self::put(vx, i, Self::get(vx, i) * s);
                Self::put(vy, i, Self::get(vy, i) * s);
            }
            Self::put(x, i, Self::get(x, i) + Self::get(vx, i));
            Self::put(y, i, Self::get(y, i) + Self::get(vy, i));
        }
    }

    /// `obstacleBounce` after the caller's box test: true when the agent struck rock `k` moving into it.
    unsafe fn rock(&self, slot: usize, k: usize) -> bool {
        let p = self.p;
        // SAFETY: `slot` is an agent and `k` a rock.
        unsafe {
            let (ox, oy) = (*at::<f32>(p.obs_x).add(k) as f64, *at::<f32>(p.obs_y).add(k) as f64);
            let reach = *at::<f32>(p.obs_radius).add(k) as f64 + Self::get(self.size, slot);
            let dx = Self::get(self.x, slot) - ox;
            let dy = Self::get(self.y, slot) - oy;
            if abs(dx) >= reach || abs(dy) >= reach {
                return false;
            }
            let d = sqrt(dx * dx + dy * dy);
            if !(d < reach) {
                return false;
            }
            let nx = if d == 0.0 { 1.0 } else { dx / d };
            let ny = if d == 0.0 { 0.0 } else { dy / d };
            Self::put(self.x, slot, ox + nx * reach);
            Self::put(self.y, slot, oy + ny * reach);
            let vn = Self::get(self.vx, slot) * nx + Self::get(self.vy, slot) * ny;
            if vn < 0.0 {
                Self::put(self.vx, slot, Self::get(self.vx, slot) - 2.0 * vn * nx);
                Self::put(self.vy, slot, Self::get(self.vy, slot) - 2.0 * vn * ny);
                return true;
            }
            false
        }
    }

    /// `resolvePair`, with `applyImpulse` and `separate`: false when the contact list is full.
    unsafe fn pair(&self, i: usize, j: usize, count: &mut u32) -> bool {
        let p = self.p;
        // SAFETY: `i` and `j` are agent slots; a contact is written only below `maxContacts`.
        unsafe {
            let (x, y, vx, vy, size) = (self.x, self.y, self.vx, self.vy, self.size);
            let dx = Self::get(x, j) - Self::get(x, i);
            let dy = Self::get(y, j) - Self::get(y, i);
            let d = sqrt(dx * dx + dy * dy);
            if !(d < Self::get(size, i) + Self::get(size, j)) {
                return true;
            }
            let n = *count;
            *count += 1;
            if n >= p.max_contacts {
                return false;
            }
            let contacts = at::<i32>(p.contacts);
            *contacts.add(2 * n as usize) = i as i32;
            *contacts.add(2 * n as usize + 1) = j as i32;
            let normal = |delta: f64, fallback: f64| if d == 0.0 { fallback } else { delta / d };
            let nx = normal(Self::get(x, j) - Self::get(x, i), 1.0);
            let ny = normal(Self::get(y, j) - Self::get(y, i), 0.0);
            let vn = (Self::get(vx, j) - Self::get(vx, i)) * nx + (Self::get(vy, j) - Self::get(vy, i)) * ny;
            if vn < 0.0 {
                let mi = Self::get(size, i) * Self::get(size, i);
                let mj = Self::get(size, j) * Self::get(size, j);
                let jn = (-(1.0 + self.dbl(D_RESTITUTION)) * vn) / (1.0 / mi + 1.0 / mj);
                Self::put(vx, i, Self::get(vx, i) - (jn * nx) / mi);
                Self::put(vy, i, Self::get(vy, i) - (jn * ny) / mi);
                Self::put(vx, j, Self::get(vx, j) + (jn * nx) / mj);
                Self::put(vy, j, Self::get(vy, j) + (jn * ny) / mj);
            }
            let nx = normal(Self::get(x, j) - Self::get(x, i), 1.0);
            let ny = normal(Self::get(y, j) - Self::get(y, i), 0.0);
            let mi = Self::get(size, i) * Self::get(size, i);
            let mj = Self::get(size, j) * Self::get(size, j);
            let pen = Self::get(size, i) + Self::get(size, j) - d;
            Self::put(x, i, Self::get(x, i) + (-nx * pen * mj) / (mi + mj));
            Self::put(y, i, Self::get(y, i) + (-ny * pen * mj) / (mi + mj));
            Self::put(x, j, Self::get(x, j) + (nx * pen * mi) / (mi + mj));
            Self::put(y, j, Self::get(y, j) + (ny * pen * mi) / (mi + mj));
            true
        }
    }

    /// `ownsPair`: whether the pair of entries `a`, `b` is owned by `cell`, the cell of their boxes' overlap corner.
    #[inline(always)]
    unsafe fn owns(&self, a: usize, b: usize, cell: u32) -> bool {
        let p = self.p;
        // SAFETY: `a` and `b` are used entries of the hash.
        unsafe {
            let (bx, by) = (at::<f64>(p.box_x), at::<f64>(p.box_y));
            let cs = self.dbl(D_CELL_SIZE);
            let col = cell_of(js_max(*bx.add(a), *bx.add(b)), cs, p.cols - 1);
            let row = cell_of(js_max(*by.add(a), *by.add(b)), cs, p.rows - 1);
            row * p.cols + col == cell
        }
    }

    /// `resolveCell`: the pairs one cell owns, agents only (they lead each cell, in ascending slot order).
    unsafe fn cell(&self, cell: u32, count: &mut u32) -> bool {
        let p = self.p;
        // SAFETY: `cellStart` has `cols * rows + 1` offsets into the used entries.
        unsafe {
            let (starts, entries) = (at::<i32>(p.cell_start), at::<i32>(p.entries));
            let end = *starts.add(cell as usize + 1) as usize;
            let max = p.max_agents as i32;
            let mut a = *starts.add(cell as usize) as usize;
            while a < end && *entries.add(a) < max {
                let mut b = a + 1;
                while b < end && *entries.add(b) < max {
                    if self.owns(a, b, cell) && !self.pair(*entries.add(a) as usize, *entries.add(b) as usize, count) {
                        return false;
                    }
                    b += 1;
                }
                a += 1;
            }
            true
        }
    }

    /// `clampAgents`: every alive centre kept inside the world, with no velocity change.
    unsafe fn clamp(&self) {
        let p = self.p;
        // SAFETY: every index is an agent slot.
        unsafe {
            let alive = at::<u8>(p.alive);
            let (w, h) = (self.dbl(D_WIDTH), self.dbl(D_HEIGHT));
            for i in 0..p.max_agents as usize {
                if *alive.add(i) == 1 {
                    let r = Self::get(self.size, i);
                    Self::put(self.x, i, js_min(js_max(Self::get(self.x, i), r), w - r));
                    let r = Self::get(self.size, i);
                    Self::put(self.y, i, js_min(js_max(Self::get(self.y, i), r), h - r));
                }
            }
        }
    }
}

/// Damps, caps and moves every alive agent (`moveAgent` for each, slots ascending).
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-physics.js` wrote.
pub unsafe fn move_all(params: u32) {
    // SAFETY: the caller passes the arena's physics parameter block.
    unsafe {
        let g = Bodies::new(params);
        let alive = at::<u8>(g.p.alive);
        let (damping, max_v, sprint_mul) = (g.dbl(D_DAMPING), g.dbl(D_MAX_VELOCITY), g.dbl(D_SPRINT_MULTIPLIER));
        for i in 0..g.p.max_agents as usize {
            if *alive.add(i) == 1 {
                g.move_agent(i, damping, max_v, sprint_mul);
            }
        }
    }
}

/// Bounces one agent off the rocks from index `from` (`bounceObstacles`), testing each box with `own`, the agent's size
/// when the scan began: the index of the first rock it strikes moving into it (JS applies the damage, then resumes
/// from the next index), or -1 when the scan is done.
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-physics.js` wrote, and `slot` is below `maxAgents`.
pub unsafe fn bounce_rocks(params: u32, slot: usize, own: f64, from: u32) -> i32 {
    // SAFETY: the caller passes the arena's physics parameter block and an agent slot; `k` stays below the rock count.
    unsafe {
        let g = Bodies::new(params);
        let (ox, oy, or) = (at::<f32>(g.p.obs_x), at::<f32>(g.p.obs_y), at::<f32>(g.p.obs_radius));
        let near = |k: usize| {
            let reach = *or.add(k) as f64 + own;
            abs(Bodies::get(g.x, slot) - *ox.add(k) as f64) < reach
                && abs(Bodies::get(g.y, slot) - *oy.add(k) as f64) < reach
        };
        let (n, own2) = (g.p.obs_count as usize, f64x2_splat(own));
        let mut k = from as usize;
        // Two rocks per test while neither is near: the same comparisons on the same position, which only `rock` moves.
        while k + 2 <= n {
            let pair = |a: *const f32| f64x2_promote_low_f32x4(v128_load64_zero(a.add(k) as *const u64));
            let reach = f64x2_add(pair(or), own2);
            let px = f64x2_splat(Bodies::get(g.x, slot));
            let py = f64x2_splat(Bodies::get(g.y, slot));
            let hit = v128_and(
                f64x2_lt(f64x2_abs(f64x2_sub(px, pair(ox))), reach),
                f64x2_lt(f64x2_abs(f64x2_sub(py, pair(oy))), reach),
            );
            if v128_any_true(hit) {
                // The first lane may move the agent, so the second is tested again on the new position.
                for j in k..k + 2 {
                    if near(j) && g.rock(slot, j) {
                        return j as i32;
                    }
                }
            }
            k += 2;
        }
        if k < n && near(k) && g.rock(slot, k) {
            return k as i32;
        }
        -1
    }
}

/// Resolves every overlapping agent pair once, cells ascending, filling the contact list, then clamps every agent into
/// the world (`resolveContacts`): the contact count, or -1 when there are more than `maxContacts`.
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-physics.js` wrote, and the hash was built on the current agents.
pub unsafe fn resolve_contacts(params: u32) -> i32 {
    // SAFETY: the caller passes the arena's physics parameter block.
    unsafe {
        let g = Bodies::new(params);
        let mut count = 0u32;
        for cell in 0..g.p.cols * g.p.rows {
            if !g.cell(cell, &mut count) {
                return -1;
            }
        }
        g.clamp();
        count as i32
    }
}
