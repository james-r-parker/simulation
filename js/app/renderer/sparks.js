// Sparks for bites, births and deaths: a fixed pool of 512 that recycles its oldest when full. A burst's directions come
// from the app's own seeded generator, never the sim's.

import { AdditiveBlending, ShaderMaterial } from 'three';
import { createPrng } from '../prng.js';
import { PALETTE } from './colors.js';
import { easeOut } from './curves.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { SPARK_FRAGMENT, SPARK_VERTEX } from './sparks-shader.js';

/** Sparks the pool holds. */
export const SPARK_CAPACITY = 512;
/** Streaks in a bite, motes in a birth and in a death, and the lengths of each in ticks. */
export const BITE_STREAKS = 8;
export const BITE_TICKS = 12;
export const BIRTH_MOTES = 6;
export const BIRTH_MOTE_TICKS = 30;
export const DEATH_MOTES = 10;
export const DEATH_TICKS = 40;
export const EATEN_FLASH_TICKS = 6;

const STREAK = 0;
const MOTE = 1;
const FLASH = 2;

/**
 * @typedef {object} SparkPool
 * @property {Float32Array} x origin
 * @property {Float32Array} y
 * @property {Float32Array} angle the direction of travel
 * @property {Float32Array} reach how far it travels, world units
 * @property {Float32Array} size streak length, or mote or flash radius
 * @property {Float32Array} rgb three floats each
 * @property {Float64Array} startTick
 * @property {Float64Array} lifeTicks
 * @property {Uint8Array} kind `STREAK`, `MOTE` or `FLASH`
 * @property {number} next the index the next spark goes in
 * @property {import('../prng.js').Prng} prng directions
 */

/**
 * @param {number} [seed] the generator seed
 * @returns {SparkPool} an empty pool
 */
export function createSparkPool(seed = 1) {
    return {
        x: new Float32Array(SPARK_CAPACITY),
        y: new Float32Array(SPARK_CAPACITY),
        angle: new Float32Array(SPARK_CAPACITY),
        reach: new Float32Array(SPARK_CAPACITY),
        size: new Float32Array(SPARK_CAPACITY),
        rgb: new Float32Array(SPARK_CAPACITY * 3),
        startTick: new Float64Array(SPARK_CAPACITY).fill(-Infinity),
        lifeTicks: new Float64Array(SPARK_CAPACITY),
        kind: new Uint8Array(SPARK_CAPACITY),
        next: 0,
        prng: createPrng(seed),
    };
}

const WHERE = { kind: 0, x: 0, y: 0 };
const SHAPE = { angle: 0, reach: 0, size: 0, tick: 0, life: 0 };

/**
 * @param {SparkPool} pool the pool
 * @param {{kind: number, x: number, y: number}} where kind and origin
 * @param {{angle: number, reach: number, size: number, tick: number, life: number}} shape the motion and length
 * @param {ArrayLike<number>} rgb the colour
 * @returns {void}
 */
function add(pool, where, shape, rgb) {
    const i = pool.next;
    pool.next = (i + 1) % SPARK_CAPACITY;
    pool.kind[i] = where.kind;
    pool.x[i] = where.x;
    pool.y[i] = where.y;
    pool.angle[i] = shape.angle;
    pool.reach[i] = shape.reach;
    pool.size[i] = shape.size;
    pool.startTick[i] = shape.tick;
    pool.lifeTicks[i] = shape.life;
    pool.rgb[i * 3] = rgb[0];
    pool.rgb[i * 3 + 1] = rgb[1];
    pool.rgb[i * 3 + 2] = rgb[2];
}

/**
 * @typedef {object} Burst
 * @property {'bite' | 'born' | 'died'} kind
 * @property {number} x the origin
 * @property {number} y
 * @property {number} tick the sim tick it begins
 * @property {number} size the agent's radius, which scales the burst
 * @property {ArrayLike<number>} rgb the lineage colour (a bite uses its own)
 * @property {boolean} [eaten] a death by predation: add a red flash
 */

/**
 * Starts a burst: a bite is 8 streaks lasting 12 ticks, a birth 6 motes lasting 30, a death 10 motes lasting 40 (and a
 * 6-tick red flash when eaten).
 * @param {SparkPool} pool the pool
 * @param {Burst} burst what happened
 * @returns {number} sparks added
 */
export function spawnBurst(pool, burst) {
    const { x, y, tick, size } = burst;
    const turn = pool.prng.next() * Math.PI * 2;
    WHERE.x = x;
    WHERE.y = y;
    SHAPE.tick = tick;
    if (burst.kind === 'bite') {
        WHERE.kind = STREAK;
        SHAPE.reach = size * 1.6;
        SHAPE.size = size * 0.8;
        SHAPE.life = BITE_TICKS;
        for (let k = 0; k < BITE_STREAKS; k++) {
            SHAPE.angle = turn + (k * 2 * Math.PI) / BITE_STREAKS;
            add(pool, WHERE, SHAPE, PALETTE.biteFlash);
        }
        return BITE_STREAKS;
    }
    const born = burst.kind === 'born';
    const count = born ? BIRTH_MOTES : DEATH_MOTES;
    WHERE.kind = MOTE;
    SHAPE.size = size * 0.2;
    SHAPE.life = born ? BIRTH_MOTE_TICKS : DEATH_TICKS;
    for (let k = 0; k < count; k++) {
        SHAPE.angle = turn + (k * 2 * Math.PI) / count + pool.prng.next() * 0.5;
        SHAPE.reach = size * (born ? 1.6 : 2.4) * (0.6 + 0.8 * pool.prng.next());
        add(pool, WHERE, SHAPE, burst.rgb);
    }
    if (burst.eaten === true) {
        WHERE.kind = FLASH;
        SHAPE.angle = 0;
        SHAPE.reach = 0;
        SHAPE.size = size * 1.4;
        SHAPE.life = EATEN_FLASH_TICKS;
        add(pool, WHERE, SHAPE, PALETTE.eatenFlash);
        return count + 1;
    }
    return count;
}

/**
 * Writes the live sparks at a tick as `x, y, angle, half length`, `r, g, b, alpha` and `thickness`.
 * @param {SparkPool} pool the pool
 * @param {number} tick the playhead's tick
 * @param {{pose: Float32Array, color: Float32Array, shape: Float32Array}} out `SPARK_CAPACITY x 4` floats each
 * @returns {number} the sparks written
 */
export function packSparks(pool, tick, out) {
    let n = 0;
    for (let i = 0; i < SPARK_CAPACITY; i++) {
        const age = (tick - pool.startTick[i]) / pool.lifeTicks[i];
        if (!(age >= 0 && age < 1)) {
            continue;
        }
        const o = n * VEC4;
        const travel = pool.reach[i] * easeOut(age);
        const kind = pool.kind[i];
        const left = 1 - age;
        out.pose[o] = pool.x[i] + Math.cos(pool.angle[i]) * travel;
        out.pose[o + 1] = pool.y[i] + Math.sin(pool.angle[i]) * travel;
        out.pose[o + 2] = pool.angle[i];
        out.pose[o + 3] = kind === STREAK ? 0.5 * pool.size[i] * left : 0;
        out.color.set(pool.rgb.subarray(i * 3, i * 3 + 3), o);
        out.color[o + 3] = kind === FLASH ? left : kind === STREAK ? left * 1.2 : left * Math.sqrt(left) * 0.9;
        out.shape[o] =
            kind === STREAK ? pool.size[i] * 0.05 : kind === FLASH ? pool.size[i] * (0.6 + 0.4 * age) : pool.size[i];
        n += 1;
    }
    return n;
}

/**
 * @param {{pool: SparkPool}} options the pool the effects player spawns into
 * @returns {import('./scene.js').Layer} the sparks, drawn additively
 */
export function createSparkLayer({ pool }) {
    const uniforms = { uZoom: { value: 1 } };
    const geometry = createQuadGeometry(SPARK_CAPACITY, ['iPose', 'iColor', 'iShape']);
    const material = new ShaderMaterial({
        vertexShader: SPARK_VERTEX,
        fragmentShader: SPARK_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geometry, material, SPARK_CAPACITY);
    const out = {
        pose: new Float32Array(SPARK_CAPACITY * VEC4),
        color: new Float32Array(SPARK_CAPACITY * VEC4),
        shape: new Float32Array(SPARK_CAPACITY * VEC4),
    };
    return {
        object: mesh,
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            const n = packSparks(pool, frame.tick, out);
            uploadInstances(mesh, { iPose: out.pose, iColor: out.color, iShape: out.shape }, n);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
