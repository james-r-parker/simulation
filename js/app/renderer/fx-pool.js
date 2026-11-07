// The effect pool: one instanced mesh of fixed capacity whose instances animate on the GPU. `spawnFx` writes one instance
// into the next ring slot and widens the dirty range; the layer uploads only that range. A full pool overwrites its
// oldest slot. Ticks are stored relative to a base so a float32 keeps sub-tick precision on long runs.

import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, ShaderMaterial, Vector4 } from 'three';
import { setFxLook, setFxQuality } from './fx-budget.js';
import { curveUniforms } from './fx-curves.js';
import { FX_FRAGMENT, FX_VERTEX } from './fx-shader.js';
import { createQuadGeometry, createQuadMesh, VEC4 } from './instanced.js';

/** Instances the pool holds; the active share depends on the quality level. */
export const FX_CAPACITY = 2048;
/** The active capacity at quality levels 0, 1 and 2. */
export const FX_CAPACITY_BY_LEVEL = Object.freeze([2048, 1024, 256]);
/** Rebase the stored ticks once the playhead is this far past the base. */
export const REBASE_TICKS = 1 << 20;

const ATTRIBUTES = /** @type {const} */ (['iPose', 'iColor', 'iTime', 'iMove']);

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
 * @param {number} level the quality level, 0 to 2
 * @returns {void}
 */
export function setFxLevel(pool, level) {
    pool.limit = FX_CAPACITY_BY_LEVEL[level] ?? FX_CAPACITY;
    if (pool.next >= pool.limit) {
        pool.next = 0;
    }
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

/**
 * Sends the dirty slots of each array to its attribute and clears the range.
 * @param {FxPool} pool the pool
 * @param {Record<string, any>} attributes the instance attributes by name
 * @returns {void}
 */
export function flushFx(pool, attributes) {
    if (pool.dirtyHi < pool.dirtyLo) {
        return;
    }
    const start = pool.dirtyLo * VEC4;
    const count = (pool.dirtyHi - pool.dirtyLo + 1) * VEC4;
    for (const name of ATTRIBUTES) {
        const attribute = attributes[name];
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(start, count);
        attribute.needsUpdate = true;
    }
    pool.dirtyLo = Infinity;
    pool.dirtyHi = -1;
}

/**
 * @returns {Record<string, {value: any}>} the pool shader's uniforms, the curve table as vec4 arrays
 */
function fxUniforms() {
    const tables = curveUniforms();
    const n = tables.scale.length / VEC4;
    const vecs = (/** @type {Float32Array} */ a) =>
        Array.from({ length: n }, (_, i) => new Vector4(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]));
    const uniforms = {
        uFxTick: { value: 0 },
        uZoom: { value: 1 },
        uCallBoost: { value: 1 },
        uScale: { value: vecs(tables.scale) },
        uAlpha: { value: vecs(tables.alpha) },
        uInfo: { value: vecs(tables.info) },
    };
    return uniforms;
}

/**
 * @param {{pool: FxPool, budget?: import('./fx-budget.js').FxBudget}} options the pool the effects player spawns into
 *   and the budget that follows the quality level and the look items
 * @returns {import('./scene.js').Layer & {uniforms: Record<string, {value: any}>}} the pool's mesh, drawn additively
 */
export function createFxLayer({ pool, budget }) {
    const uniforms = fxUniforms();
    const geometry = createQuadGeometry(1, []);
    const arrays = { iPose: pool.pose, iColor: pool.color, iTime: pool.time, iMove: pool.move };
    for (const name of ATTRIBUTES) {
        geometry.setAttribute(name, new InstancedBufferAttribute(arrays[name], VEC4).setUsage(DynamicDrawUsage));
    }
    const material = new ShaderMaterial({
        vertexShader: FX_VERTEX,
        fragmentShader: FX_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geometry, material, FX_CAPACITY);
    mesh.count = FX_CAPACITY;
    mesh.visible = true;
    return {
        object: mesh,
        uniforms,
        setQuality(level) {
            setFxLevel(pool, level);
            if (budget) {
                setFxQuality(budget, level);
            }
        },
        setLook(look) {
            if (budget) {
                setFxLook(budget, look);
            }
        },
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            uniforms.uFxTick.value = Number.isNaN(pool.base) ? -1e9 : frame.tick + pool.clockOffset - pool.base;
            uniforms.uCallBoost.value = frame.lenses.calls ? 1 / 0.35 : 1;
            flushFx(pool, geometry.attributes);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
