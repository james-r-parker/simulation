// The effect pool's ring: fixed-capacity instance records that the effect recipes spawn into and the effect layer
// animates by age. `spawnFx` writes one record into the next ring slot (a full ring overwrites its oldest); ticks are
// stored relative to a base so a float32 keeps sub-tick precision on long runs. Pure; no GPU objects.

/** Instances the ring holds. */
export const FX_CAPACITY = 4096;
/** The effect colour gain under the high-contrast palette. */
export const HIGH_CONTRAST_GAIN = 1.5;
/** Rebase the stored ticks once the playhead is this far past the base. */
export const REBASE_TICKS = 1 << 20;
const VEC4 = 4;

/**
 * @typedef {object} FxRecord one instance to spawn; the caller reuses one scratch record
 * @property {number} x
 * @property {number} y
 * @property {number} angle heading of the shape and its motion, radians
 * @property {number} size world units at scale 1
 * @property {number} r linear colour
 * @property {number} g
 * @property {number} b
 * @property {number} gain colour multiplier
 * @property {number} tick the sim tick it starts
 * @property {number} life ticks
 * @property {number} curve an `FX_CURVES` index
 * @property {number} seed 0 to 1
 * @property {number} reach how far its motion travels, world units
 * @property {number} stretch length over width along the heading (1 round)
 * @property {number} minPx the least it is drawn across, device px
 */

/**
 * @typedef {object} FxPool
 * @property {Float32Array} pose `FX_CAPACITY x 4`: x, y, angle, size
 * @property {Float32Array} color r, g, b, gain
 * @property {Float32Array} time start (rebased), life, curve, seed
 * @property {Float32Array} move reach, stretch, least px, 0
 * @property {number} limit the active capacity
 * @property {number} next the slot the next instance goes in
 * @property {number} base the tick the stored starts are relative to, NaN before the first spawn
 * @property {number} dirtyLo the lowest slot written since the last upload, `Infinity` when none
 * @property {number} dirtyHi the highest
 * @property {number} spawned instances spawned since creation
 * @property {number} overwrote live instances overwritten since creation
 * @property {number} clockOffset ticks added to the playhead for the shader's clock (the demo's own clock), else 0
 */

/**
 * @returns {FxPool} an empty pool at the full capacity
 */
export function createFxPool() {
    return {
        pose: new Float32Array(FX_CAPACITY * VEC4),
        color: new Float32Array(FX_CAPACITY * VEC4),
        time: new Float32Array(FX_CAPACITY * VEC4).fill(-1e9),
        move: new Float32Array(FX_CAPACITY * VEC4),
        limit: FX_CAPACITY,
        next: 0,
        base: Number.NaN,
        dirtyLo: Infinity,
        dirtyHi: -1,
        spawned: 0,
        overwrote: 0,
        clockOffset: 0,
    };
}

/**
 * @param {FxPool} pool the pool
 * @param {number} i a slot
 * @param {number} tick the playhead tick
 * @returns {boolean} whether the slot still draws at the tick
 */
export function isLive(pool, i, tick) {
    const age = (tick - pool.base - pool.time[i * VEC4]) / pool.time[i * VEC4 + 1];
    return age >= 0 && age < 1;
}

/**
 * Moves the base to `tick` and shifts every stored start, marking the whole pool dirty.
 * @param {FxPool} pool the pool
 * @param {number} tick the new base
 * @returns {void}
 */
export function rebaseFx(pool, tick) {
    const shift = Number.isNaN(pool.base) ? 0 : pool.base - tick;
    for (let i = 0; i < FX_CAPACITY; i++) {
        pool.time[i * VEC4] += shift;
    }
    pool.base = tick;
    pool.dirtyLo = 0;
    pool.dirtyHi = FX_CAPACITY - 1;
}

/**
 * @param {FxPool} pool the pool
 * @param {FxRecord} rec the instance; copied, never kept
 * @returns {number} the slot written
 */
export function spawnFx(pool, rec) {
    if (Number.isNaN(pool.base) || rec.tick - pool.base > REBASE_TICKS) {
        rebaseFx(pool, rec.tick);
    }
    const i = pool.next;
    pool.next = (i + 1) % pool.limit;
    if (isLive(pool, i, rec.tick)) {
        pool.overwrote += 1;
    }
    const o = i * VEC4;
    const { pose, color, time, move } = pool;
    pose[o] = rec.x;
    pose[o + 1] = rec.y;
    pose[o + 2] = rec.angle;
    pose[o + 3] = rec.size;
    color[o] = rec.r;
    color[o + 1] = rec.g;
    color[o + 2] = rec.b;
    color[o + 3] = rec.gain;
    time[o] = rec.tick - pool.base;
    time[o + 1] = Math.max(rec.life, 1);
    time[o + 2] = rec.curve;
    time[o + 3] = rec.seed;
    move[o] = rec.reach;
    move[o + 1] = rec.stretch;
    move[o + 2] = rec.minPx;
    move[o + 3] = 0;
    pool.dirtyLo = Math.min(pool.dirtyLo, i);
    pool.dirtyHi = Math.max(pool.dirtyHi, i);
    pool.spawned += 1;
    return i;
}

/**
 * @param {FxPool} pool the pool
 * @returns {number} live instances at the pool's newest start tick (for `__perf`)
 */
export function occupancy(pool) {
    let n = 0;
    const now = pool.base + pool.time[((pool.next + pool.limit - 1) % pool.limit) * VEC4];
    for (let i = 0; i < pool.limit; i++) {
        n += isLive(pool, i, now) ? 1 : 0;
    }
    return n;
}
