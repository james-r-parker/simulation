//! The ray march of the sense phase: `gatherNear` (`js/sim/ray-gather.js`) and the nearest hit of every ray
//! (`nearestHitsAll` and `nearestHitCovered` in `js/sim/ray-march.js`), for one casting agent per call.
//!
//! Bit-identity rules (docs/designs/wasm-kernels.md): every value is computed with the JS operations in the JS order,
//! each `f32` world value widens to `f64` before it is used, `Math.sqrt` and `Math.floor` are the IEEE instructions,
//! and the gathered rows keep the JS order (obstacles, herd bodies, smoke clouds, then the hash cells row by row), so the
//! mate scan and the `coverConceals` count that read them in order see the same rows. Each agent hit also writes what
//! its body shows the caster (`raySize`, `raySpeed`, `rayClosing`: docs/designs/body-genes.md, "Raw lanes"), with the
//! det-math `tanh`. The class of an agent hit and everything else that is a rule stays in JS.

use core::arch::wasm32::{
    f64x2_add, f64x2_eq, f64x2_extract_lane, f64x2_ge, f64x2_gt, f64x2_lt, f64x2_mul, f64x2_neg, f64x2_splat,
    f64x2_sqrt, f64x2_sub, i64x2_bitmask, v128, v128_and, v128_andnot, v128_any_true, v128_bitselect, v128_load,
    v128_not, v128_or, v128_store,
};

use crate::det_math::{det_tanh, floor};

/// The parameter block JS writes (`js/sim/wasm-sense.js`, `writeSenseParams`): byte offsets of the arrays, then sizes.
#[repr(C)]
pub struct SenseParams {
    ray_scratch: u32,
    ray_stamp: u32,
    ray_local: u32,
    best_t: u32,
    best_key: u32,
    ray_dirs: u32,
    x: u32,
    y: u32,
    size: u32,
    food_x: u32,
    food_y: u32,
    food_radius: u32,
    obs_x: u32,
    obs_y: u32,
    obs_radius: u32,
    herd_alive: u32,
    herd_x: u32,
    herd_y: u32,
    cloud_x: u32,
    cloud_y: u32,
    cover_ring: u32,
    ray_cos: u32,
    ray_sin: u32,
    cell_start: u32,
    entries: u32,
    sense_doubles: u32,
    food_kind: u32,
    ray_reach_by_spec: u32,
    ray_reach: u32,
    ray_smoke: u32,
    vx: u32,
    vy: u32,
    ray_size: u32,
    ray_speed: u32,
    ray_closing: u32,
    max_agents: u32,
    stamp_count: u32,
    obs_count: u32,
    herd_max: u32,
    cloud_count: u32,
    ray_count: u32,
    cols: u32,
    rows: u32,
    conceals: u32,
    concealed: u32,
    see_plant: u32,
    see_meat: u32,
    spec: u32,
    body_fault: u32,
}

/// Indices into the doubles block.
const D_SMOKE_RADIUS: usize = 0;
const D_HERD_RADIUS: usize = 1;
const D_WIDTH: usize = 2;
const D_HEIGHT: usize = 3;
const D_CELL_SIZE: usize = 4;
const D_SMOKE_PASS: usize = 5;
const D_SPEED_SPAN: usize = 6;

/// Indices into `rayScratch` (`ray-gather.js` and `ray-march.js`).
const OX: usize = 0;
const OY: usize = 1;
const RANGE: usize = 2;
const STAMP: usize = 3;
const DX: usize = 4;
const DY: usize = 5;
const COS_H: usize = 8;
const SIN_H: usize = 9;

/// Hit kinds and the key stride (`ray-gather.js`).
const FOOD: f64 = 0.0;
const AGENT: f64 = 1.0;
const OBSTACLE: f64 = 2.0;
const WALL: f64 = 3.0;
const SMOKE: f64 = 4.0;
const HERD: f64 = 5.0;
const KIND_STRIDE: f64 = 4294967296.0;
const LOCAL_STRIDE: usize = 4;
const REACH_SLACK: f64 = 1.000001;
const BOX_MARGIN: f64 = 1.0;
const MAX_STAMP: f64 = 2147483000.0;

#[inline(always)]
fn at<T>(base: u32) -> *mut T {
    base as usize as *mut T
}

/// `Math.sqrt`: the IEEE square root, correctly rounded as in JS.
#[inline(always)]
fn sqrt(x: f64) -> f64 {
    f64x2_extract_lane::<0>(f64x2_sqrt(f64x2_splat(x)))
}

/// `Math.min` of two doubles that are never NaN here: the smaller, and -0 when they are equal zeros of either sign.
#[inline(always)]
fn js_min(a: f64, b: f64) -> f64 {
    if a < b {
        a
    } else if b < a {
        b
    } else if a.is_sign_negative() {
        a
    } else {
        b
    }
}

/// `Math.min` of two doubles: NaN when either is NaN, else `js_min`.
#[inline(always)]
fn js_min_nan(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        js_min(a, b)
    }
}

/// `Math.max` of two doubles: NaN when either is NaN, the larger, and +0 when they are equal zeros of either sign.
#[inline(always)]
fn js_max_nan(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else if b > a {
        b
    } else if a.is_sign_positive() {
        a
    } else {
        b
    }
}

/// Typed pointers resolved from `SenseParams`.
struct Sense {
    s: *mut f64,
    stamp: *mut i32,
    local: *mut f64,
    best_t: *mut f64,
    best_key: *mut f64,
    dirs: *mut f64,
    reach: *mut f64,
    smoke: *mut f64,
    d: *const f64,
    p: &'static SenseParams,
}

impl Sense {
    /// # Safety
    /// `p` must describe arrays inside the memory.
    unsafe fn new(p: &'static SenseParams) -> Sense {
        Sense {
            s: at(p.ray_scratch),
            stamp: at(p.ray_stamp),
            local: at(p.ray_local),
            best_t: at(p.best_t),
            best_key: at(p.best_key),
            dirs: at(p.ray_dirs),
            reach: at(p.ray_reach),
            smoke: at(p.ray_smoke),
            d: at(p.sense_doubles),
            p,
        }
    }

    #[inline(always)]
    unsafe fn sc(&self, i: usize) -> f64 {
        // SAFETY: `rayScratch` holds `RAY_SCRATCH` doubles.
        unsafe { *self.s.add(i) }
    }

    #[inline(always)]
    unsafe fn dbl(&self, i: usize) -> f64 {
        // SAFETY: the doubles block holds seven doubles.
        unsafe { *self.d.add(i) }
    }

    /// Writes one gathered row.
    #[inline(always)]
    unsafe fn push(&self, n: usize, ox: f64, oy: f64, c: f64, key: f64) {
        // SAFETY: `rayLocal` is sized for every circle the world can hold.
        unsafe {
            let row = self.local.add(n * LOCAL_STRIDE);
            *row = ox;
            *row.add(1) = oy;
            *row.add(2) = c;
            *row.add(3) = key;
        }
    }
}

/// `fixtureC`: the row's `c`, or `None` when the circle is out of reach.
#[inline(always)]
fn fixture_c(range: f64, ox: f64, oy: f64, r: f64) -> Option<f64> {
    let reach = range + r;
    let d2 = ox * ox + oy * oy;
    if d2 > reach * reach * REACH_SLACK {
        None
    } else {
        Some(d2 - r * r)
    }
}

/// `appendObstacles`, `appendHerds` and the smoke loop of `appendFixtures`.
unsafe fn append_fixtures(g: &Sense) -> usize {
    // SAFETY: every array is sized by the world and the counts come from it.
    unsafe {
        let p = g.p;
        let (px, py, range) = (g.sc(OX), g.sc(OY), g.sc(RANGE));
        let mut n = 0;
        let (obs_x, obs_y, obs_r) = (at::<f32>(p.obs_x), at::<f32>(p.obs_y), at::<f32>(p.obs_radius));
        for i in 0..p.obs_count as usize {
            let ox = px - *obs_x.add(i) as f64;
            let r = *obs_r.add(i) as f64;
            let reach = range + r;
            if ox * ox > reach * reach * REACH_SLACK {
                continue;
            }
            let oy = py - *obs_y.add(i) as f64;
            if let Some(c) = fixture_c(range, ox, oy, r) {
                g.push(n, ox, oy, c, OBSTACLE * KIND_STRIDE + i as f64);
                n += 1;
            }
        }
        let herd_radius = g.dbl(D_HERD_RADIUS);
        let herd_reach = range + herd_radius;
        let herd_reach2 = herd_reach * herd_reach * REACH_SLACK;
        let (alive, hx, hy) = (at::<u8>(p.herd_alive), at::<f32>(p.herd_x), at::<f32>(p.herd_y));
        for i in 0..p.herd_max as usize {
            if *alive.add(i) != 1 {
                continue;
            }
            let ox = px - *hx.add(i) as f64;
            if ox * ox > herd_reach2 {
                continue;
            }
            let oy = py - *hy.add(i) as f64;
            if let Some(c) = fixture_c(range, ox, oy, herd_radius) {
                g.push(n, ox, oy, c, HERD * KIND_STRIDE + i as f64);
                n += 1;
            }
        }
        let radius = g.dbl(D_SMOKE_RADIUS);
        let (cx, cy) = (at::<f32>(p.cloud_x), at::<f32>(p.cloud_y));
        for i in 0..p.cloud_count as usize {
            let ox = px - *cx.add(i) as f64;
            let oy = py - *cy.add(i) as f64;
            if let Some(c) = fixture_c(range, ox, oy, radius) {
                g.push(n, ox, oy, c, SMOKE * KIND_STRIDE + i as f64);
                n += 1;
            }
        }
        n
    }
}

/// eat-choice G3: whether the caster sees food of this `foodKind` (0 a plant, else meat): only food it can eat.
#[inline(always)]
fn sees_food(p: &SenseParams, kind: u8) -> bool {
    if kind == 0 { p.see_plant != 0 } else { p.see_meat != 0 }
}

/// `appendCircle`: one hash entry, kept when its surface lies within range; a food item the caster cannot eat is left
/// out, so its rays pass through it to whatever lies behind.
#[inline(always)]
unsafe fn append_circle(g: &Sense, n: usize, id: usize) -> usize {
    // SAFETY: `id` is an agent slot or `maxAgents` plus a food slot.
    unsafe {
        let p = g.p;
        let max_agents = p.max_agents as usize;
        if id >= max_agents && !sees_food(p, *at::<u8>(p.food_kind).add(id - max_agents)) {
            return n;
        }
        let (cx, cy, r, key) = if id < max_agents {
            let x = *at::<f32>(p.x).add(id) as f64;
            let y = *at::<f32>(p.y).add(id) as f64;
            (x, y, *at::<f32>(p.size).add(id) as f64, AGENT * KIND_STRIDE + id as f64)
        } else {
            let f = id - max_agents;
            let x = *at::<f32>(p.food_x).add(f) as f64;
            let y = *at::<f32>(p.food_y).add(f) as f64;
            (
                x,
                y,
                *at::<f32>(p.food_radius).add(f) as f64,
                FOOD * KIND_STRIDE + f as f64,
            )
        };
        let ox = g.sc(OX) - cx;
        let oy = g.sc(OY) - cy;
        let reach = g.sc(RANGE) + r;
        let d2 = ox * ox + oy * oy;
        if d2 > reach * reach * REACH_SLACK {
            return n;
        }
        g.push(n, ox, oy, d2 - r * r, key);
        n + 1
    }
}

/// `startStamp`: a new stamp, the caster stamped so it is never listed; the stamps clear near the Int32 limit.
unsafe fn start_stamp(g: &Sense, slot: usize) -> i32 {
    // SAFETY: `rayStamp` holds `stamp_count` entries and `slot` is below `maxAgents`.
    unsafe {
        let mut stamp = g.sc(STAMP) + 1.0;
        if stamp >= MAX_STAMP {
            for i in 0..g.p.stamp_count as usize {
                *g.stamp.add(i) = 0;
            }
            stamp = 1.0;
        }
        *g.s.add(STAMP) = stamp;
        let as_int = stamp as i32;
        *g.stamp.add(slot) = as_int;
        as_int
    }
}

/// `cellOf`: the clamped cell coordinate of a world coordinate.
#[inline(always)]
fn cell_of(v: f64, cell_size: f64, last: u32) -> usize {
    let c = floor(v / cell_size);
    if c < 0.0 {
        0
    } else if c > last as f64 {
        last as usize
    } else {
        c as usize
    }
}

/// `gatherNear`: the rows of every circle within range of the origin, in the JS order; returns the row count.
unsafe fn gather(g: &Sense, slot: usize) -> usize {
    // SAFETY: the hash arrays are the mirror `syncHash` copied, sized `cols * rows + 1` and `entryCount`.
    unsafe {
        let p = g.p;
        let stamp = start_stamp(g, slot);
        let cell_size = g.dbl(D_CELL_SIZE);
        let reach = g.sc(RANGE) + BOX_MARGIN;
        let (ox, oy) = (g.sc(OX), g.sc(OY));
        let c0 = cell_of(ox - reach, cell_size, p.cols - 1);
        let c1 = cell_of(ox + reach, cell_size, p.cols - 1);
        let r0 = cell_of(oy - reach, cell_size, p.rows - 1);
        let r1 = cell_of(oy + reach, cell_size, p.rows - 1);
        let mut n = append_fixtures(g);
        let (starts, entries) = (at::<i32>(p.cell_start), at::<i32>(p.entries));
        let cols = p.cols as usize;
        for row in r0..=r1 {
            for col in c0..=c1 {
                let cell = row * cols + col;
                let end = *starts.add(cell + 1) as usize;
                for e in *starts.add(cell) as usize..end {
                    let id = *entries.add(e) as usize;
                    if *g.stamp.add(id) != stamp {
                        *g.stamp.add(id) = stamp;
                        n = append_circle(g, n, id);
                    }
                }
            }
        }
        n
    }
}

/// `wallDistance`: the distance to the boundary line the ray heads for, or Infinity when parallel.
#[inline(always)]
fn wall_distance(origin: f64, dir: f64, extent: f64) -> f64 {
    if dir < 0.0 {
        -origin / dir
    } else if dir > 0.0 {
        (extent - origin) / dir
    } else {
        f64::INFINITY
    }
}

/// `circleHit`: the distance to the circle's surface (0 from inside), or -1 for none.
#[inline(always)]
fn circle_hit(b: f64, c: f64) -> f64 {
    let disc = b * b - c;
    if disc < 0.0 || (b > 0.0 && c > 0.0) {
        return -1.0;
    }
    let t = -b - sqrt(disc);
    if t < 0.0 { 0.0 } else { t }
}

/// Sets the scratch direction of ray `k` and returns its wall seed (`seedWithWall`) within the ray's `reach`: the best
/// distance so far.
#[inline(always)]
unsafe fn seed_ray(g: &Sense, k: usize, reach: f64) -> f64 {
    // SAFETY: `rayCos` and `raySin` hold `rayCount` doubles and `k` is below it.
    unsafe {
        let (cos, sin) = (*at::<f64>(g.p.ray_cos).add(k), *at::<f64>(g.p.ray_sin).add(k));
        let dx = g.sc(COS_H) * cos - g.sc(SIN_H) * sin;
        let dy = g.sc(SIN_H) * cos + g.sc(COS_H) * sin;
        *g.s.add(DX) = dx;
        *g.s.add(DY) = dy;
        let t_wall = js_min(
            wall_distance(g.sc(OX), dx, g.dbl(D_WIDTH)),
            wall_distance(g.sc(OY), dy, g.dbl(D_HEIGHT)),
        );
        if t_wall >= 0.0 && t_wall <= reach {
            t_wall
        } else {
            f64::INFINITY
        }
    }
}

/// Seeds every ray: its reach (the range times the caster's specialisation row of `rayReachBySpec`, senses-and-motor
/// Phase 5) into `reach`, its direction into `dirs` (all x, then all y), its wall hit into the best arrays. Leaves the
/// last ray's direction in the scratch, as the JS loops do.
unsafe fn seed_all(g: &Sense) {
    // SAFETY: the best arrays and `reach` hold `rayCount` doubles, `dirs` twice that, and `rayReachBySpec` a row of
    // `rayCount` per specialisation.
    unsafe {
        let rays = g.p.ray_count as usize;
        let range = g.sc(RANGE);
        let row = at::<f64>(g.p.ray_reach_by_spec).add(g.p.spec as usize * rays);
        for k in 0..rays {
            let reach = range * *row.add(k);
            *g.reach.add(k) = reach;
            *g.best_t.add(k) = seed_ray(g, k, reach);
            *g.best_key.add(k) = WALL * KIND_STRIDE;
            *g.dirs.add(k) = g.sc(DX);
            *g.dirs.add(rays + k) = g.sc(DY);
        }
    }
}

/// One row against two rays, the first half of `circleHit` per lane: `b`, the discriminant, and the lanes that hit.
#[inline(always)]
fn reach2(dx: v128, dy: v128, lx: v128, ly: v128, lc: v128) -> (v128, v128, v128) {
    let zero = f64x2_splat(0.0);
    let b = f64x2_add(f64x2_mul(dx, lx), f64x2_mul(dy, ly));
    let disc = f64x2_sub(f64x2_mul(b, b), lc);
    let miss = v128_or(f64x2_lt(disc, zero), v128_and(f64x2_gt(b, zero), f64x2_gt(lc, zero)));
    (b, disc, v128_not(miss))
}

/// The second half of `circleHit` per lane: the distance to the surface, 0 from inside.
#[inline(always)]
fn dist2(b: v128, disc: v128) -> v128 {
    let zero = f64x2_splat(0.0);
    let t0 = f64x2_sub(f64x2_neg(b), f64x2_sqrt(disc));
    v128_bitselect(zero, t0, f64x2_lt(t0, zero))
}

/// `nearestHitsAll`: every ray's nearest hit among the gathered rows and the walls, ties to the lower key. Scalar and
/// row-major, as in JS: a row is loaded once and tested against every ray, and a miss returns before the square root.
/// (Two rays per `f64x2` measured slower here: most rows miss most rays, and the vector form pays for both lanes.)
unsafe fn nearest_all(g: &Sense, count: usize) {
    // SAFETY: the best arrays hold `rayCount` doubles, `dirs` twice that, and `rayLocal` holds `count` rows.
    unsafe {
        seed_all(g);
        let rays = g.p.ray_count as usize;
        for row in 0..count {
            let r = g.local.add(row * LOCAL_STRIDE);
            let (lx, ly, lc, lk) = (*r, *r.add(1), *r.add(2), *r.add(3));
            for k in 0..rays {
                let t = circle_hit(*g.dirs.add(k) * lx + *g.dirs.add(rays + k) * ly, lc);
                let best = *g.best_t.add(k);
                if t >= 0.0 && t <= *g.reach.add(k) && (t < best || (t == best && lk < *g.best_key.add(k))) {
                    *g.best_t.add(k) = t;
                    *g.best_key.add(k) = lk;
                }
            }
        }
    }
}

/// `isConcealed`: an agent standing in a ring the caster is not in.
#[inline(always)]
unsafe fn concealed(ring: *const u8, key: f64, caster_ring: u8) -> bool {
    if key < AGENT * KIND_STRIDE || key >= OBSTACLE * KIND_STRIDE {
        return false;
    }
    // SAFETY: an agent key's index is a slot below `maxAgents`.
    let r = unsafe { *ring.add((key - AGENT * KIND_STRIDE) as usize) };
    r != 0 && r != caster_ring
}

/// `nearestHitCovered` for every ray: the rows in order, a concealed agent that would be the ray's best so far skipped
/// and counted, any other candidate taken. Two rays per `f64x2` (a row's concealment is the same for both lanes); an odd
/// last ray runs alone. Returns the count of concealed hits skipped over all rays.
unsafe fn nearest_covered(g: &Sense, count: usize, slot: usize) -> u32 {
    // SAFETY: as for `nearest_all`; `coverRing` holds `maxAgents` bytes.
    unsafe {
        seed_all(g);
        let ring = at::<u8>(g.p.cover_ring);
        let caster_ring = *ring.add(slot);
        let rays = g.p.ray_count as usize;
        let zero = f64x2_splat(0.0);
        let mut skipped = 0;
        let mut k = 0;
        while k + 2 <= rays {
            let dx = v128_load(g.dirs.add(k) as *const v128);
            let dy = v128_load(g.dirs.add(rays + k) as *const v128);
            let vrange = v128_load(g.reach.add(k) as *const v128);
            let mut best = v128_load(g.best_t.add(k) as *const v128);
            let mut key = v128_load(g.best_key.add(k) as *const v128);
            for row in 0..count {
                let r = g.local.add(row * LOCAL_STRIDE);
                let row_key = *r.add(3);
                let lk = f64x2_splat(row_key);
                let (b, disc, hit) = reach2(dx, dy, f64x2_splat(*r), f64x2_splat(*r.add(1)), f64x2_splat(*r.add(2)));
                if !v128_any_true(hit) {
                    continue;
                }
                let t = dist2(b, disc);
                let worse = v128_or(f64x2_gt(t, best), v128_and(f64x2_eq(t, best), f64x2_ge(lk, key)));
                let out = v128_or(v128_or(f64x2_lt(t, zero), f64x2_gt(t, vrange)), worse);
                let pass = v128_andnot(hit, out);
                if !v128_any_true(pass) {
                    continue;
                }
                if concealed(ring, row_key, caster_ring) {
                    skipped += (i64x2_bitmask(pass) as u32).count_ones();
                } else {
                    best = v128_bitselect(t, best, pass);
                    key = v128_bitselect(lk, key, pass);
                }
            }
            v128_store(g.best_t.add(k) as *mut v128, best);
            v128_store(g.best_key.add(k) as *mut v128, key);
            k += 2;
        }
        if k < rays {
            let (dx, dy) = (*g.dirs.add(k), *g.dirs.add(rays + k));
            let mut best_t = *g.best_t.add(k);
            let mut best_key = *g.best_key.add(k);
            let range = *g.reach.add(k);
            for row in 0..count {
                let r = g.local.add(row * LOCAL_STRIDE);
                let t = circle_hit(dx * *r + dy * *r.add(1), *r.add(2));
                let key = *r.add(3);
                if t < 0.0 || t > range || t > best_t || (t == best_t && key >= best_key) {
                    continue;
                }
                if concealed(ring, key, caster_ring) {
                    skipped += 1;
                } else {
                    best_t = t;
                    best_key = key;
                }
            }
            *g.best_t.add(k) = best_t;
            *g.best_key.add(k) = best_key;
        }
        skipped
    }
}

/// Whether a hit key is a smoke cloud.
#[inline(always)]
fn is_smoke(key: f64) -> bool {
    (SMOKE * KIND_STRIDE..HERD * KIND_STRIDE).contains(&key)
}

/// The next hit of ray `k` past a smoke cloud it met at `from`, out to `limit`: the nearest wall or row that is not a
/// smoke cloud nor, when `caster_ring` is given (rings conceal), an agent concealed from the caster; ties to the lower
/// key. `Infinity` for none.
unsafe fn next_past_smoke(g: &Sense, count: usize, k: usize, span: (f64, f64), caster_ring: Option<u8>) -> (f64, f64) {
    // SAFETY: as for `nearest_all`; `coverRing` holds `maxAgents` bytes.
    unsafe {
        let (from, limit) = span;
        let rays = g.p.ray_count as usize;
        let (dx, dy) = (*g.dirs.add(k), *g.dirs.add(rays + k));
        let t_wall = js_min(
            wall_distance(g.sc(OX), dx, g.dbl(D_WIDTH)),
            wall_distance(g.sc(OY), dy, g.dbl(D_HEIGHT)),
        );
        let mut best = if t_wall >= from && t_wall <= limit {
            t_wall
        } else {
            f64::INFINITY
        };
        let mut best_key = WALL * KIND_STRIDE;
        let ring = at::<u8>(g.p.cover_ring);
        for row in 0..count {
            let r = g.local.add(row * LOCAL_STRIDE);
            let key = *r.add(3);
            if is_smoke(key) || caster_ring.is_some_and(|own| concealed(ring, key, own)) {
                continue;
            }
            let t = circle_hit(dx * *r + dy * *r.add(1), *r.add(2));
            if t >= from && t <= limit && (t < best || (t == best && key < best_key)) {
                best = t;
                best_key = key;
            }
        }
        (best, best_key)
    }
}

/// smokeSight (docs/designs/body-genes.md, T13a): a ray whose nearest hit is a smoke cloud keeps `smokePass` of its
/// remaining reach and reports the next hit within it, its `raySmoke` entry set to 1 so the smoke channel still reads;
/// a ray with no hit there keeps the cloud. Every entry of `raySmoke` is written; a pass of 0 changes no hit.
unsafe fn pass_smoke(g: &Sense, count: usize, slot: usize) {
    // SAFETY: the best arrays, `reach` and `raySmoke` hold `rayCount` doubles.
    unsafe {
        let rays = g.p.ray_count as usize;
        for k in 0..rays {
            *g.smoke.add(k) = 0.0;
        }
        let pass = g.dbl(D_SMOKE_PASS);
        if pass <= 0.0 {
            return;
        }
        let caster_ring = if g.p.conceals != 0 {
            Some(*at::<u8>(g.p.cover_ring).add(slot))
        } else {
            None
        };
        for k in 0..rays {
            if !is_smoke(*g.best_key.add(k)) {
                continue;
            }
            let from = *g.best_t.add(k);
            let limit = from + pass * (*g.reach.add(k) - from);
            let (t, key) = next_past_smoke(g, count, k, (from, limit), caster_ring);
            if t != f64::INFINITY {
                *g.best_t.add(k) = t;
                *g.best_key.add(k) = key;
                *g.smoke.add(k) = 1.0;
            }
        }
    }
}

/// The caster's numbers `bodySenseOf` reads for every hit: position, velocity and size, widened from `f32`, and the
/// speed span (`maxVelocity x SPEED_SENSE_SPAN`).
struct Caster {
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    size: f64,
    span: f64,
}

/// `bodySenseOf` (docs/designs/body-genes.md, "Raw lanes") of the agent in slot `hit`: its size against the caster's
/// (`detTanh`), its speed over the span capped at 1, and the rate the gap shrinks over the span clamped to plus or minus
/// 1 (0 when the centres coincide), each with the JS operations in the JS order. `None` when the size ratio is not
/// finite, where `detTanh` throws.
#[inline(always)]
unsafe fn body_sense(p: &SenseParams, c: &Caster, hit: usize) -> Option<(f64, f64, f64)> {
    // SAFETY: `hit` is an agent slot below `maxAgents`, and the five arrays hold `maxAgents` floats.
    unsafe {
        let hvx = *at::<f32>(p.vx).add(hit) as f64;
        let hvy = *at::<f32>(p.vy).add(hit) as f64;
        let ratio = *at::<f32>(p.size).add(hit) as f64 / c.size - 1.0;
        if !ratio.is_finite() {
            return None;
        }
        let size = det_tanh(ratio);
        let speed = js_min_nan(1.0, sqrt(hvx * hvx + hvy * hvy) / c.span);
        let dx = *at::<f32>(p.x).add(hit) as f64 - c.x;
        let dy = *at::<f32>(p.y).add(hit) as f64 - c.y;
        let d = sqrt(dx * dx + dy * dy);
        if d == 0.0 {
            return Some((size, speed, 0.0));
        }
        // 0 - rate, not -rate: a body crossing at a constant gap reads +0, never -0.
        let rate = (hvx - c.vx) * dx + (hvy - c.vy) * dy;
        Some((
            size,
            speed,
            js_max_nan(-1.0, js_min_nan(1.0, (0.0 - rate) / d / c.span)),
        ))
    }
}

/// Writes every ray's body lanes at `slot x rayCount + k`: what the body shows for an agent hit, 0 on all three for any
/// other hit or none. Returns false when a hit's size ratio is not finite (its lanes then read 0).
unsafe fn write_body(g: &Sense, slot: usize) -> bool {
    // SAFETY: the lanes hold `rayCount` floats per slot, the best arrays `rayCount` doubles, and `slot` is below
    // `maxAgents`.
    unsafe {
        let p = g.p;
        let rays = p.ray_count as usize;
        let c = Caster {
            x: *at::<f32>(p.x).add(slot) as f64,
            y: *at::<f32>(p.y).add(slot) as f64,
            vx: *at::<f32>(p.vx).add(slot) as f64,
            vy: *at::<f32>(p.vy).add(slot) as f64,
            size: *at::<f32>(p.size).add(slot) as f64,
            span: g.dbl(D_SPEED_SPAN),
        };
        let base = slot * rays;
        let (out_size, out_speed, out_closing) = (
            at::<f32>(p.ray_size).add(base),
            at::<f32>(p.ray_speed).add(base),
            at::<f32>(p.ray_closing).add(base),
        );
        let mut ok = true;
        for k in 0..rays {
            let key = *g.best_key.add(k);
            let mut lanes = (0.0, 0.0, 0.0);
            if *g.best_t.add(k) != f64::INFINITY && (AGENT * KIND_STRIDE..OBSTACLE * KIND_STRIDE).contains(&key) {
                match body_sense(p, &c, (key - AGENT * KIND_STRIDE) as usize) {
                    Some(v) => lanes = v,
                    None => ok = false,
                }
            }
            *out_size.add(k) = lanes.0 as f32;
            *out_speed.add(k) = lanes.1 as f32;
            *out_closing.add(k) = lanes.2 as f32;
        }
        ok
    }
}

/// Gathers the caster's circles within the full range and finds every ray's nearest hit within its own reach, then
/// lets the rays that met smoke see on through it by the caster's smoke pass, and writes every ray's body lanes. The
/// origin, range and heading are in `rayScratch`; the caster's specialisation is in `spec` and its smoke pass and the
/// speed span in the doubles block. Returns the gathered row count; with `conceals` the skipped count goes to
/// `concealed`; `body_fault` is 1 when a hit's size ratio was not finite, else 0.
///
/// # Safety
/// `params` addresses a `SenseParams` block whose arrays lie inside the memory, and `slot` is below `maxAgents`.
pub unsafe fn sense_slot(params: u32, slot: usize) -> usize {
    // SAFETY: as documented.
    unsafe {
        let p: &'static mut SenseParams = &mut *at::<SenseParams>(params);
        let g = Sense::new(&*(p as *const SenseParams));
        let count = gather(&g, slot);
        if p.conceals != 0 {
            p.concealed = nearest_covered(&g, count, slot);
        } else {
            nearest_all(&g, count);
        }
        pass_smoke(&g, count, slot);
        p.body_fault = if write_body(&g, slot) { 0 } else { 1 };
        count
    }
}
