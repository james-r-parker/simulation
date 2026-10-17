// Rings: the alarm and hunt calls and the birth ring. A fixed pool of 128 recycles its oldest ring when full; a ring's
// age is the playhead's tick over its life, so rings freeze with a paused sim.

import { AdditiveBlending, ShaderMaterial } from 'three';
import { PALETTE } from './colors.js';
import { easeOut } from './curves.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { RING_FRAGMENT, RING_VERTEX } from './rings-shader.js';

/** Rings the pool holds. */
export const RING_CAPACITY = 128;
/** The share of full strength a call ring draws at, which the calls lens lifts to 1. */
export const CALL_STRENGTH = 0.35;
/** How long a birth ring lasts, in ticks. */
export const BIRTH_TICKS = 30;

/** @typedef {'alarm' | 'hunt' | 'birth'} RingKind */

/**
 * The radius, alpha and width of a ring at an age.
 * @param {RingKind} kind the ring
 * @param {number} age 0 when it starts, 1 when it ends
 * @param {number} radius the call radius (`callRadius`), or the birth ring's full radius
 * @param {{radius: number, alpha: number, width: number}} [out] receives the result
 * @returns {{radius: number, alpha: number, width: number}} `alarm`: radius `radius x easeOut(age)`, alpha
 *   `0.35 x (1 - age)^2`, 1.5 px wide; `hunt`: radius `radius x (0.25 + 0.35 x fract(3 x age))`, alpha
 *   `0.35 x (1 - age) x (0.6 + 0.4 x sin(6 PI x age))`, 2 px; `birth`: radius `radius x easeOut(age)`, alpha
 *   `0.5 x (1 - age)^2`, 1.5 px
 */
export function ringAt(kind, age, radius, out = { radius: 0, alpha: 0, width: 0 }) {
    const left = 1 - age;
    if (kind === 'hunt') {
        const phase = 3 * age;
        out.radius = radius * (0.25 + 0.35 * (phase - Math.floor(phase)));
        out.alpha = CALL_STRENGTH * left * (0.6 + 0.4 * Math.sin(6 * Math.PI * age));
        out.width = 2;
    } else {
        out.radius = radius * easeOut(age);
        out.alpha = (kind === 'alarm' ? CALL_STRENGTH : 0.5) * left * left;
        out.width = 1.5;
    }
    return out;
}

/**
 * @typedef {object} RingPool
 * @property {Float32Array} x
 * @property {Float32Array} y
 * @property {Float32Array} radius full radius
 * @property {Float32Array} rgb three floats per ring
 * @property {Float64Array} startTick the sim tick it began
 * @property {Float64Array} lifeTicks how long it lasts
 * @property {Uint8Array} kind 0 alarm, 1 hunt, 2 birth
 * @property {number} next the index the next ring goes in (the oldest, once full)
 */

const BIRTH = 2;
const KINDS = /** @type {RingKind[]} */ (['alarm', 'hunt', 'birth']);

/**
 * @returns {RingPool} an empty pool of `RING_CAPACITY` rings
 */
export function createRingPool() {
    return {
        x: new Float32Array(RING_CAPACITY),
        y: new Float32Array(RING_CAPACITY),
        radius: new Float32Array(RING_CAPACITY),
        rgb: new Float32Array(RING_CAPACITY * 3),
        startTick: new Float64Array(RING_CAPACITY).fill(-Infinity),
        lifeTicks: new Float64Array(RING_CAPACITY),
        kind: new Uint8Array(RING_CAPACITY),
        next: 0,
    };
}

/**
 * Starts a ring, overwriting the oldest when the pool is full.
 * @param {RingPool} pool the pool
 * @param {{kind: RingKind, x: number, y: number, tick: number, radius: number, life: number, rgb: ArrayLike<number>}} ring
 *   `tick` is the sim tick it begins, `life` its length in ticks
 * @returns {void}
 */
export function spawnRing(pool, ring) {
    const i = pool.next;
    pool.next = (i + 1) % RING_CAPACITY;
    pool.x[i] = ring.x;
    pool.y[i] = ring.y;
    pool.radius[i] = ring.radius;
    pool.rgb[i * 3] = ring.rgb[0];
    pool.rgb[i * 3 + 1] = ring.rgb[1];
    pool.rgb[i * 3 + 2] = ring.rgb[2];
    pool.startTick[i] = ring.tick;
    pool.lifeTicks[i] = ring.life;
    pool.kind[i] = KINDS.indexOf(ring.kind);
}

const SHAPE = { radius: 0, alpha: 0, width: 0 };

/**
 * Writes the live rings at a tick as `x, y, radius, width` and `r, g, b, alpha`.
 * @param {RingPool} pool the pool
 * @param {number} tick the playhead's tick
 * @param {{ring: Float32Array, color: Float32Array}} out `RING_CAPACITY x 4` floats each
 * @param {number} [callBoost] multiplies the alpha of call rings (1 / 0.35 under the calls lens)
 * @returns {number} the rings written
 */
export function packRings(pool, tick, out, callBoost = 1) {
    let n = 0;
    for (let i = 0; i < RING_CAPACITY; i++) {
        const age = (tick - pool.startTick[i]) / pool.lifeTicks[i];
        if (!(age >= 0 && age < 1)) {
            continue;
        }
        ringAt(KINDS[pool.kind[i]], age, pool.radius[i], SHAPE);
        const o = n * VEC4;
        out.ring[o] = pool.x[i];
        out.ring[o + 1] = pool.y[i];
        out.ring[o + 2] = SHAPE.radius;
        out.ring[o + 3] = SHAPE.width;
        out.color[o] = pool.rgb[i * 3];
        out.color[o + 1] = pool.rgb[i * 3 + 1];
        out.color[o + 2] = pool.rgb[i * 3 + 2];
        out.color[o + 3] = SHAPE.alpha * (pool.kind[i] === BIRTH ? 1 : callBoost);
        n += 1;
    }
    return n;
}

/**
 * @param {{pool: RingPool}} options the pool the effects player spawns into
 * @returns {import('./scene.js').Layer} the rings, drawn additively
 */
export function createRingLayer({ pool }) {
    const uniforms = { uZoom: { value: 1 } };
    const geometry = createQuadGeometry(RING_CAPACITY, ['iRing', 'iColor']);
    const material = new ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geometry, material, RING_CAPACITY);
    const out = { ring: new Float32Array(RING_CAPACITY * VEC4), color: new Float32Array(RING_CAPACITY * VEC4) };
    return {
        object: mesh,
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            const boost = frame.lenses.calls ? 1 / CALL_STRENGTH : 1;
            uploadInstances(mesh, { iRing: out.ring, iColor: out.color }, packRings(pool, frame.tick, out, boost));
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}

/** The ring colours by call kind. */
export const RING_COLORS = Object.freeze({ alarm: PALETTE.alarmRing, hunt: PALETTE.huntRing });
