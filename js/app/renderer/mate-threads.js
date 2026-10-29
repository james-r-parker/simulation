// Courtship threads: a thin curved thread of light between a mating pair in the mother's
// family colour mixed 40% towards white at intensity 1.1, following both agents while they live.

import { familyColor } from './colors.js';
import { clearLines, createLineBuffer, pushVertex, setLineColor } from './line-buffer.js';
import { createLineMesh } from './line-mesh.js';

export const MATE_TICKS = 45;
export const MATE_FADE_TICKS = 6;
export const MATE_SEGMENTS = 12;
export const MATE_POOL_CAPACITY = 32;

/**
 * Standard GLSL-style smoothstep.
 * @param {number} edge0 lower edge
 * @param {number} edge1 upper edge
 * @param {number} x input value
 * @returns {number} smoothstep result in [0, 1]
 */
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/**
 * Alpha envelope of a courtship thread over its normalised age.
 * @param {number} age01 age in [0, 1]
 * @returns {number} alpha in [0, 1]
 */
export function threadAt(age01) {
    if (age01 <= 0 || age01 >= 1) {
        return 0;
    }
    return smoothstep(0, 0.15, age01) * (1 - smoothstep(0.6, 1, age01));
}

/**
 * Evaluates a quadratic curve offset from the midpoint by 0.18 * length perpendicular.
 * Can be called as (a, b, t, out) where a and b are [x, y], or as (ax, ay, bx, by, t, out, sign).
 * @param {any} a start point [x, y] or start x
 * @param {any} b end point [x, y] or start y
 * @param {number} [t] parameter in [0, 1]
 * @param {number[]} [out] receiving point
 * @returns {number[]} out
 */
export function threadCurve(a, b, t, out) {
    let ax;
    let ay;
    let bx;
    let by;
    let actualT;
    let actualOut;
    let actualSign;
    if (typeof a === 'number' && typeof b === 'number') {
        ax = a;
        ay = b;
        bx = arguments[2];
        by = arguments[3];
        actualT = arguments[4];
        actualOut = arguments[5] || [0, 0];
        actualSign = arguments[6] ?? 1;
    } else {
        ax = a[0];
        ay = a[1];
        bx = b[0];
        by = b[1];
        actualT = t;
        actualOut = out || [0, 0];
        actualSign = arguments[4] ?? 1;
    }
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const px = len > 0 ? -dy / len : 0;
    const py = len > 0 ? dx / len : 0;
    const offset = 0.18 * len * actualSign;
    const cx = mx + px * offset;
    const cy = my + py * offset;
    const t1 = 1 - actualT;
    actualOut[0] = t1 * t1 * ax + 2 * t1 * actualT * cx + actualT * actualT * bx;
    actualOut[1] = t1 * t1 * ay + 2 * t1 * actualT * cy + actualT * actualT * by;
    return actualOut;
}

/**
 * @typedef {object} MateThreadPool
 * @property {number} capacity
 * @property {number} next
 * @property {number} count
 * @property {Uint32Array} motherGenome
 * @property {Uint32Array} fatherGenome
 * @property {Uint32Array} motherLineage
 * @property {Float64Array} startTick
 * @property {Float32Array} lastMotherX
 * @property {Float32Array} lastMotherY
 * @property {Float32Array} lastFatherX
 * @property {Float32Array} lastFatherY
 * @property {Float64Array} goneAt
 * @property {Uint8Array} alive
 * @property {Int8Array} sign
 */

/**
 * Creates a pool of courtship threads.
 * @param {number} [capacity] pool capacity (default 32)
 * @returns {MateThreadPool} the pool
 */
export function createMateThreadPool(capacity = MATE_POOL_CAPACITY) {
    return {
        capacity,
        next: 0,
        count: 0,
        motherGenome: new Uint32Array(capacity),
        fatherGenome: new Uint32Array(capacity),
        motherLineage: new Uint32Array(capacity),
        startTick: new Float64Array(capacity),
        lastMotherX: new Float32Array(capacity),
        lastMotherY: new Float32Array(capacity),
        lastFatherX: new Float32Array(capacity),
        lastFatherY: new Float32Array(capacity),
        goneAt: new Float64Array(capacity).fill(-1),
        alive: new Uint8Array(capacity),
        sign: new Int8Array(capacity),
    };
}

/**
 * Spawns a thread into the pool, recycling the oldest when full.
 * @param {MateThreadPool} pool the pool
 * @param {{x: number, y: number, tick: number, a: number, b: number, d: number}} effect MATED effect record
 * @returns {number} slot index
 */
export function spawnMateThread(pool, effect) {
    const idx = pool.next;
    pool.next = (pool.next + 1) % pool.capacity;
    if (pool.count < pool.capacity) {
        pool.count += 1;
    }
    pool.motherGenome[idx] = effect.a;
    pool.fatherGenome[idx] = effect.b;
    pool.motherLineage[idx] = effect.d;
    pool.startTick[idx] = effect.tick;
    pool.lastMotherX[idx] = effect.x;
    pool.lastMotherY[idx] = effect.y;
    pool.lastFatherX[idx] = effect.x;
    pool.lastFatherY[idx] = effect.y;
    pool.goneAt[idx] = -1;
    pool.alive[idx] = 1;
    pool.sign[idx] = idx % 2 === 0 ? 1 : -1;
    return idx;
}

function findGenome(agents, genomeId) {
    for (let i = 0; i < agents.count; i++) {
        if (agents.genomeId[i] === genomeId) {
            return i;
        }
    }
    return -1;
}

const SCRATCH_P0 = [0, 0];
const SCRATCH_P1 = [0, 0];
const SCRATCH_RGB = [0, 0, 0];

/**
 * Resolves thread endpoints and current alpha.
 * @param {MateThreadPool} pool pool
 * @param {number} i thread index
 * @param {import('../interpolate.js').Interpolated} agents blended agents
 * @param {number} playheadTick current tick
 * @returns {{ax: number, ay: number, bx: number, by: number, alpha: number} | null}
 */
function resolveEndpoints(pool, i, agents, playheadTick) {
    const age = (playheadTick - pool.startTick[i]) / MATE_TICKS;
    if (age < 0 || age >= 1) {
        pool.alive[i] = 0;
        return null;
    }
    const mIdx = findGenome(agents, pool.motherGenome[i]);
    const fIdx = findGenome(agents, pool.fatherGenome[i]);
    let ax;
    let ay;
    let bx;
    let by;
    let fadeAlpha = 1;

    if (mIdx >= 0 && fIdx >= 0) {
        ax = agents.x[mIdx];
        ay = agents.y[mIdx];
        bx = agents.x[fIdx];
        by = agents.y[fIdx];
        pool.lastMotherX[i] = ax;
        pool.lastMotherY[i] = ay;
        pool.lastFatherX[i] = bx;
        pool.lastFatherY[i] = by;
        pool.goneAt[i] = -1;
    } else {
        if (pool.goneAt[i] < 0) {
            pool.goneAt[i] = playheadTick;
        }
        const goneAge = playheadTick - pool.goneAt[i];
        if (goneAge >= MATE_FADE_TICKS) {
            pool.alive[i] = 0;
            return null;
        }
        fadeAlpha = 1 - goneAge / MATE_FADE_TICKS;
        ax = pool.lastMotherX[i];
        ay = pool.lastMotherY[i];
        bx = pool.lastFatherX[i];
        by = pool.lastFatherY[i];
    }
    const alpha = threadAt(age) * fadeAlpha;
    return alpha > 0.001 ? { ax, ay, bx, by, alpha } : null;
}

/**
 * Steps threads and pushes line segments into the line buffer.
 * @param {MateThreadPool} pool thread pool
 * @param {{agents: import('../interpolate.js').Interpolated, tick?: number, family: import('../family-slots.js').FamilySlots}} frame frame
 * @param {import('./line-buffer.js').LineBuffer} lines line buffer
 */
export function stepMateThreads(pool, frame, lines) {
    clearLines(lines);
    const { agents, tick = 0, family } = frame;
    for (let i = 0; i < pool.capacity; i++) {
        if (pool.alive[i] === 0) {
            continue;
        }
        const res = resolveEndpoints(pool, i, agents, tick);
        if (res === null) {
            continue;
        }
        const baseRgb = familyColor(family, pool.motherLineage[i], 1.0, SCRATCH_RGB);
        setLineColor(
            lines,
            [(baseRgb[0] * 0.6 + 0.4) * 1.1, (baseRgb[1] * 0.6 + 0.4) * 1.1, (baseRgb[2] * 0.6 + 0.4) * 1.1],
            res.alpha,
        );
        const sgn = pool.sign[i];
        for (let s = 0; s < MATE_SEGMENTS; s++) {
            threadCurve(res.ax, res.ay, res.bx, res.by, s / MATE_SEGMENTS, SCRATCH_P0, sgn);
            threadCurve(res.ax, res.ay, res.bx, res.by, (s + 1) / MATE_SEGMENTS, SCRATCH_P1, sgn);
            pushVertex(lines, SCRATCH_P0[0], SCRATCH_P0[1]);
            pushVertex(lines, SCRATCH_P1[0], SCRATCH_P1[1]);
        }
    }
}

/**
 * Creates the mate thread layer.
 * @param {{pool: MateThreadPool}} options pool
 * @returns {import('./scene.js').Layer} thread layer
 */
export function createMateThreadLayer({ pool }) {
    const lines = createLineBuffer(MATE_POOL_CAPACITY * MATE_SEGMENTS);
    const mesh = createLineMesh(lines);
    return {
        object: mesh.object,
        setLook(look) {
            const tier = look?.threads ?? 0;
            mesh.object.visible = tier < 2;
        },
        update(frame) {
            if (!mesh.object.visible) {
                return;
            }
            stepMateThreads(pool, frame, lines);
            mesh.upload();
        },
        dispose() {
            mesh.dispose();
        },
    };
}
