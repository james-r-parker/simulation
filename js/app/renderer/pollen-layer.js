// Emits seed-derived pollen particles from carriers at 20-tick intervals.
import { AdditiveBlending, ShaderMaterial } from 'three';
import { floraColor } from './flora-colors.js';
import { SCENERY_MAX_LUMINANCE } from './colors.js';
import { LOOK_OFF } from './quality.js';
import { createQuadGeometry, createQuadMesh, uploadInstances } from './instanced.js';

const CAPACITY = 512;
const INTERVAL = 20;
const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPollen;
attribute vec4 iColor;
uniform float uZoom;
varying vec2 vLocal;
varying vec4 vColor;
void main() {
    vLocal = corner;
    vColor = iColor;
    gl_Position = projectionMatrix * viewMatrix * vec4(iPollen.xy + corner / uZoom, 0.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying vec4 vColor;
void main() {
    float shape = 1.0 - smoothstep(0.65, 1.0, length(vLocal));
    gl_FragColor = vec4(vColor.rgb * vColor.a * shape, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

/**
 * @param {number} maxAgents agent slots
 * @param {number} seed world seed
 * @param {Record<string, number>} flags snapshot bit definitions
 * @returns {Record<string, any>} bounded reusable particle state
 */
export function createPollenPool(maxAgents, seed, flags) {
    return {
        seed,
        flags,
        next: 0,
        lastTick: -1,
        lastBucket: new Float64Array(maxAgents).fill(-1),
        genome: new Uint32Array(maxAgents),
        x: new Float32Array(CAPACITY),
        y: new Float32Array(CAPACITY),
        angle: new Float32Array(CAPACITY),
        hue: new Float32Array(CAPACITY),
        born: new Float64Array(CAPACITY).fill(-Infinity),
        pose: new Float32Array(CAPACITY * 4),
        color: new Float32Array(CAPACITY * 4),
        rgb: [0, 0, 0],
    };
}

/**
 * @param {Record<string, any>} pool particle state
 * @param {import('../interpolate.js').Interpolated} agents interpolated agents
 * @param {number} index agent index
 * @param {number} bucket 20-tick emission index
 * @returns {void}
 */
function emit(pool, agents, index, bucket) {
    const at = pool.next;
    pool.next = (at + 1) % CAPACITY;
    const bits = agents.flags[index];
    const mixed = Math.imul((agents.genomeId[index] ^ pool.seed) >>> 0, 2654435761) >>> 0;
    const phase = mixed / 4294967296 + bucket * 0.61803398875;
    pool.angle[at] = (phase - Math.floor(phase)) * 2 * Math.PI;
    pool.x[at] = agents.x[index];
    pool.y[at] = agents.y[index];
    pool.hue[at] =
        (((bits >>> pool.flags.POLLEN_HUE_SHIFT) & pool.flags.POLLEN_HUE_MASK) / pool.flags.POLLEN_HUE_MASK) * 2 - 1;
    pool.born[at] = bucket * INTERVAL;
}

/**
 * Advances emissions by simulation tick; repeated frames at one tick never emit twice.
 * @param {Record<string, any>} pool particle state
 * @param {import('../interpolate.js').Interpolated} agents interpolated agents
 * @param {number} tick playhead tick
 * @returns {void}
 */
export function emitPollen(pool, agents, tick) {
    const bucket = Math.floor(tick / INTERVAL);
    if (tick < pool.lastTick) {
        pool.lastBucket.fill(-1);
        pool.born.fill(-Infinity);
    }
    pool.lastTick = tick;
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        if ((agents.flags[i] & pool.flags.POLLEN) === 0) {
            pool.lastBucket[slot] = bucket;
            continue;
        }
        if (pool.genome[slot] !== agents.genomeId[i] || pool.lastBucket[slot] < 0) {
            pool.genome[slot] = agents.genomeId[i];
            pool.lastBucket[slot] = bucket - 1;
        }
        const first = Math.max(pool.lastBucket[slot] + 1, bucket - CAPACITY + 1);
        for (let next = first; next <= bucket; next++) {
            emit(pool, agents, i, next);
        }
        pool.lastBucket[slot] = bucket;
    }
}

/**
 * @param {Record<string, any>} pool particle state
 * @param {number} tick playhead tick
 * @returns {number} live particle count
 */
export function packPollen(pool, tick) {
    let count = 0;
    for (let i = 0; i < CAPACITY; i++) {
        const age = (tick - pool.born[i]) / INTERVAL;
        if (!(age >= 0 && age < 1)) {
            continue;
        }
        const at = count++ * 4;
        pool.pose[at] = pool.x[i] + Math.cos(pool.angle[i]) * 12 * age;
        pool.pose[at + 1] = pool.y[i] + Math.sin(pool.angle[i]) * 12 * age;
        floraColor(pool.hue[i], pool.rgb);
        const y = 0.2126729 * pool.rgb[0] + 0.7151522 * pool.rgb[1] + 0.072175 * pool.rgb[2];
        const scale = SCENERY_MAX_LUMINANCE / y;
        pool.color[at] = pool.rgb[0] * scale;
        pool.color[at + 1] = pool.rgb[1] * scale;
        pool.color[at + 2] = pool.rgb[2] * scale;
        pool.color[at + 3] = 1 - age;
    }
    return count;
}

/**
 * @param {{info: Record<string, any>, seed: number, flags: Record<string, number>, player: Record<string, any>}} context world layout
 * @returns {import('./scene.js').Layer} particle layer
 */
export function createPollenLayer({ info, seed, flags, player }) {
    const pool = createPollenPool(info.maxAgents, seed, flags);
    const geom = createQuadGeometry(CAPACITY, ['iPollen', 'iColor']);
    const uniforms = { uZoom: { value: 1 } };
    const mat = new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geom, mat, CAPACITY);
    const sources = { iPollen: pool.pose, iColor: pool.color };
    let enabled = true;
    return {
        object: mesh,
        setLook(look) {
            const next = look.flora !== LOOK_OFF;
            if (next !== enabled) {
                pool.lastBucket.fill(-1);
                pool.genome.fill(0);
                pool.born.fill(-Infinity);
            }
            enabled = next;
            player.floraEnabled = enabled;
            if (!enabled) {
                mesh.visible = false;
            }
        },
        update(frame) {
            if (!enabled) {
                return;
            }
            uniforms.uZoom.value = frame.camera.zoom;
            emitPollen(pool, frame.agents, frame.tick);
            uploadInstances(mesh, sources, packPollen(pool, frame.tick));
        },
        dispose() {
            geom.dispose();
            mat.dispose();
            mesh.dispose();
        },
    };
}
