// Courtship threads: a thin curved thread of light between a mating pair in the mother's
// family colour mixed 40% towards white at intensity 1.1, following both agents while they live.

import { familyColor } from './colors.js';
import { smoothstep } from './curves.js';
import { clearLines, createLineBuffer, pushVertex, setLineColor } from './line-buffer.js';
import { createLineMesh } from './line-mesh.js';

export const MATE_TICKS = 45;
export const MATE_FADE_TICKS = 6;
export const MATE_SEGMENTS = 12;
export const MATE_SEGMENTS_LOW = 4;
export const MATE_POOL_CAPACITY = 32;

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
 * The endpoints of a thread and the side it bulges to, written into one scratch object so no frame allocates.
 * @typedef {object} ThreadEnds
 * @property {number} ax the mother's x
 * @property {number} ay the mother's y
 * @property {number} bx the father's x
 * @property {number} by the father's y
 * @property {number} sign 1 or -1: the side of the line the control point is on
 */

/**
 * @returns {ThreadEnds} an empty set of endpoints
 */
export function createThreadEnds() {
    return { ax: 0, ay: 0, bx: 0, by: 0, sign: 1 };
}

/**
 * Evaluates a quadratic curve through both endpoints whose control point is offset from the midpoint by 0.18 x the
 * length, perpendicular to the line (the perpendicular `(-dy, dx)` is as long as the line, so no square root is needed).
 * @param {ThreadEnds} ends the endpoints and the side
 * @param {number} t 0 at the mother, 1 at the father
 * @param {{0: number, 1: number}} out receives x and y
 * @returns {{0: number, 1: number}} out
 */
export function threadCurve(ends, t, out) {
    const { ax, ay, bx, by, sign } = ends;
    const bulge = 0.18 * sign;
    const cx = (ax + bx) * 0.5 - (by - ay) * bulge;
    const cy = (ay + by) * 0.5 + (bx - ax) * bulge;
    const u = 1 - t;
    out[0] = u * u * ax + 2 * u * t * cx + t * t * bx;
    out[1] = u * u * ay + 2 * u * t * cy + t * t * by;
    return out;
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

/**
 * @param {import('../interpolate.js').Interpolated} agents agents
 * @param {number} genomeId genome id
 * @returns {number} slot index or -1
 */
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
const SCRATCH_LINE = [0, 0, 0];
const ENDS = createThreadEnds();

/**
 * Resolves a thread's endpoints into `ENDS` and its alpha. While both agents live it follows them; once one is gone it
 * holds the last positions and fades over `MATE_FADE_TICKS`.
 * @param {MateThreadPool} pool pool
 * @param {number} i thread index
 * @param {import('../interpolate.js').Interpolated} agents blended agents
 * @param {number} playheadTick current tick
 * @returns {number} the thread's alpha, 0 when it draws nothing (and then it is also freed once it has ended)
 */
function resolveEndpoints(pool, i, agents, playheadTick) {
    const age = (playheadTick - pool.startTick[i]) / MATE_TICKS;
    if (age < 0 || age >= 1) {
        pool.alive[i] = 0;
        return 0;
    }
    const mIdx = findGenome(agents, pool.motherGenome[i]);
    const fIdx = findGenome(agents, pool.fatherGenome[i]);
    let fade = 1;
    if (mIdx >= 0 && fIdx >= 0) {
        pool.lastMotherX[i] = agents.x[mIdx];
        pool.lastMotherY[i] = agents.y[mIdx];
        pool.lastFatherX[i] = agents.x[fIdx];
        pool.lastFatherY[i] = agents.y[fIdx];
        pool.goneAt[i] = -1;
    } else {
        if (pool.goneAt[i] < 0) {
            pool.goneAt[i] = playheadTick;
        }
        const goneAge = playheadTick - pool.goneAt[i];
        if (goneAge >= MATE_FADE_TICKS) {
            pool.alive[i] = 0;
            return 0;
        }
        fade = 1 - goneAge / MATE_FADE_TICKS;
    }
    ENDS.ax = pool.lastMotherX[i];
    ENDS.ay = pool.lastMotherY[i];
    ENDS.bx = pool.lastFatherX[i];
    ENDS.by = pool.lastFatherY[i];
    ENDS.sign = pool.sign[i];
    const alpha = threadAt(age) * fade;
    return alpha > 0.001 ? alpha : 0;
}

/**
 * Sets the line colour to the mother's family colour mixed 40% towards white at intensity 1.1, so the bloom lifts it.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {import('../family-slots.js').FamilySlots} family the family slots
 * @param {number} lineageId the mother's lineage
 * @param {number} alpha the thread's alpha
 * @returns {void}
 */
function colorThread(lines, family, lineageId, alpha) {
    familyColor(family, lineageId, 1.0, SCRATCH_RGB);
    for (let c = 0; c < 3; c++) {
        SCRATCH_LINE[c] = (SCRATCH_RGB[c] * 0.6 + 0.4) * 1.1;
    }
    setLineColor(lines, SCRATCH_LINE, alpha);
}

/**
 * Steps threads and pushes line segments into the line buffer.
 * @param {MateThreadPool} pool thread pool
 * @param {{agents: import('../interpolate.js').Interpolated, tick?: number, family: import('../family-slots.js').FamilySlots}} frame frame
 * @param {import('./line-buffer.js').LineBuffer} lines line buffer
 * @param {number} [segments] segments per thread (`MATE_SEGMENTS` at level 0, `MATE_SEGMENTS_LOW` at level 1)
 * @returns {void}
 */
export function stepMateThreads(pool, frame, lines, segments = MATE_SEGMENTS) {
    clearLines(lines);
    const { agents, tick = 0, family } = frame;
    for (let i = 0; i < pool.capacity; i++) {
        if (pool.alive[i] === 0) {
            continue;
        }
        const alpha = resolveEndpoints(pool, i, agents, tick);
        if (alpha === 0) {
            continue;
        }
        colorThread(lines, family, pool.motherLineage[i], alpha);
        threadCurve(ENDS, 0, SCRATCH_P1);
        for (let s = 1; s <= segments; s++) {
            SCRATCH_P0[0] = SCRATCH_P1[0];
            SCRATCH_P0[1] = SCRATCH_P1[1];
            threadCurve(ENDS, s / segments, SCRATCH_P1);
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
    let segments = MATE_SEGMENTS;
    return {
        object: mesh.object,
        setLook(look) {
            const tier = look?.threads ?? 0;
            segments = tier === 0 ? MATE_SEGMENTS : MATE_SEGMENTS_LOW;
            mesh.object.visible = tier >= 0 && tier < 2;
        },
        update(frame) {
            if (!mesh.object.visible) {
                return;
            }
            stepMateThreads(pool, frame, lines, segments);
            mesh.upload();
        },
        dispose() {
            mesh.dispose();
        },
    };
}
