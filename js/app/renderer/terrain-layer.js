// The static terrain layer: northern/southern frost bands with procedural tileable noise
// and glowing circular refuge zones.

import {
    AdditiveBlending,
    BufferGeometry,
    DataTexture,
    Float32BufferAttribute,
    Group,
    LinearFilter,
    Mesh,
    RedFormat,
    RepeatWrapping,
    ShaderMaterial,
    UnsignedByteType,
} from 'three';
import { createPrng } from '../prng.js';
import { PALETTE, SCENERY_MAX_LUMINANCE } from './colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';

export const FROST_WIDTH = 256;
export const FROST_HEIGHT = 32;

/**
 * Fills a 256 x 32 horizontally tileable 4-octave value noise texture.
 *
 * @param {number} seed world seed
 * @param {Uint8Array} [out] destination array of 256 * 32 bytes
 * @returns {Uint8Array} out
 */
export function frostTexture(seed, out = new Uint8Array(FROST_WIDTH * FROST_HEIGHT)) {
    const prng = createPrng(seed);
    const table = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
        table[i] = prng.next();
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} periodX
     * @returns {number}
     */
    const sample = (x, y, periodX) => {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);
        const x0 = ((ix % periodX) + periodX) % periodX;
        const x1 = (x0 + 1) % periodX;
        const y0 = ((iy % 32) + 32) % 32;
        const y1 = (y0 + 1) % 32;
        /**
         * @param {number} gx
         * @param {number} gy
         * @returns {number}
         */
        const h = (gx, gy) => table[(gx * 17 + gy * 31) % 512];
        const a = h(x0, y0);
        const b = h(x1, y0);
        const c = h(x0, y1);
        const d = h(x1, y1);
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };

    for (let y = 0; y < FROST_HEIGHT; y++) {
        for (let x = 0; x < FROST_WIDTH; x++) {
            let n = 0;
            let amp = 0.5;
            let total = 0;
            for (let o = 0; o < 4; o++) {
                const freq = 1 << o;
                const periodX = 16 * freq;
                n += amp * sample((x / FROST_WIDTH) * periodX, y * 0.1 * freq, periodX);
                total += amp;
                amp *= 0.5;
            }
            out[y * FROST_WIDTH + x] = Math.floor((n / total) * 255);
        }
    }
    return out;
}

const FROST_VERTEX = /* glsl */ `
attribute vec2 position;
attribute float edgeDist;
uniform vec2 uWorld;
varying vec2 vWorld;
varying float vEdgeDist;
void main() {
    vWorld = position;
    vEdgeDist = edgeDist;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 0.0, 1.0);
}
`;

const FROST_FRAGMENT = /* glsl */ `
uniform sampler2D uFrostTex;
uniform vec3 uFrostColor;
uniform float uColdMargin;
uniform float uTime;
uniform float uTier;
varying vec2 vWorld;
varying float vEdgeDist;
void main() {
    float normDist = clamp(vEdgeDist / uColdMargin, 0.0, 1.0);
    float profile = (1.0 - normDist) * (1.0 - normDist);
    float shimmer = (uTier < 0.5) ? (0.85 + 0.15 * sin(uTime / 7.0 + vWorld.x / 90.0)) : 1.0;
    float noise = texture2D(uFrostTex, vec2(vWorld.x / 1024.0, normDist)).r;
    vec3 rgb = uFrostColor * (noise * profile * shimmer);
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

const REFUGE_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iRefuge; // x, y, radius, 0
varying vec2 vLocal;
void main() {
    vLocal = corner;
    vec2 pos = iRefuge.xy + corner * iRefuge.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 0.0, 1.0);
}
`;

const REFUGE_FRAGMENT = /* glsl */ `
uniform vec3 uGlowColor;
uniform float uSceneryMax;
uniform float uTime;
varying vec2 vLocal;
void main() {
    float d = length(vLocal);
    if (d >= 1.0) {
        discard;
    }
    float breath = 0.5 + 0.5 * sin(uTime * 0.785398); // 8 s period
    float intensity = 0.5 * uSceneryMax * (1.0 - d) * (0.8 + 0.2 * breath);
    gl_FragColor = vec4(uGlowColor * intensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/**
 * @param {number} w world width
 * @param {number} h world height
 * @param {number} m margin
 * @returns {any} geometry
 */
function createFrostGeometry(w, h, m) {
    const positions = new Float32Array([
        0,
        0,
        w,
        0,
        w,
        m,
        0,
        0,
        w,
        m,
        0,
        m, // South
        0,
        h - m,
        w,
        h - m,
        w,
        h,
        0,
        h - m,
        w,
        h,
        0,
        h, // North
    ]);
    const edgeDists = new Float32Array([
        0,
        0,
        m,
        0,
        m,
        m, // South
        m,
        m,
        0,
        m,
        0,
        0, // North
    ]);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(positions, 2));
    geom.setAttribute('edgeDist', new Float32BufferAttribute(edgeDists, 1));
    return geom;
}

/**
 * @param {Record<string, any>} info world info
 * @param {number} seed seed
 * @param {Record<string, {value: any}>} uniforms uniforms
 * @returns {any} mesh info
 */
function createFrostMesh(info, seed, uniforms) {
    const m = info.terrain?.coldMarginWidth ?? 0;
    if (m <= 0) {
        return null;
    }
    const data = frostTexture(seed);
    const tex = new DataTexture(data, FROST_WIDTH, FROST_HEIGHT, RedFormat, UnsignedByteType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    uniforms.uFrostTex.value = tex;

    const geom = createFrostGeometry(info.worldWidth, info.worldHeight, m);
    const mat = new ShaderMaterial({
        vertexShader: FROST_VERTEX,
        fragmentShader: FROST_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    return { mesh: new Mesh(geom, mat), tex, geom, mat };
}

/**
 * @param {Record<string, any>} info world info
 * @param {Record<string, {value: any}>} uniforms uniforms
 * @returns {any} refuge mesh
 */
function createRefugeMesh(info, uniforms) {
    const refuges = info.terrain?.refuges ?? [];
    if (refuges.length === 0) {
        return null;
    }
    const geom = createQuadGeometry(refuges.length, ['iRefuge']);
    const mat = new ShaderMaterial({
        vertexShader: REFUGE_VERTEX,
        fragmentShader: REFUGE_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geom, mat, refuges.length);
    const packed = new Float32Array(refuges.length * VEC4);
    for (let i = 0; i < refuges.length; i++) {
        const o = i * VEC4;
        packed[o] = refuges[i].x;
        packed[o + 1] = refuges[i].y;
        packed[o + 2] = refuges[i].radius;
        packed[o + 3] = 0;
    }
    uploadInstances(mesh, { iRefuge: packed }, refuges.length);
    return { mesh, geom, mat };
}

/**
 * @param {boolean} hasBasins has basins layout
 * @param {Record<string, any>} info world info
 * @param {number} seed seed
 * @param {Record<string, any>} uniforms uniforms
 * @returns {{frost: any, refuge: any}} terrain meshes
 */
function buildTerrainMeshes(hasBasins, info, seed, uniforms) {
    if (!hasBasins) {
        return { frost: null, refuge: null };
    }
    const s = seed ?? info.seed ?? 0;
    return {
        frost: createFrostMesh(info, s, uniforms.frost),
        refuge: createRefugeMesh(info, uniforms.refuge),
    };
}

/**
 * @param {any} frost frost mesh info
 * @param {any} refuge refuge mesh info
 */
function disposeTerrain(frost, refuge) {
    if (frost) {
        frost.geom.dispose();
        frost.mat.dispose();
        frost.tex.dispose();
    }
    if (refuge) {
        refuge.geom.dispose();
        refuge.mat.dispose();
    }
}

/**
 * @param {{info: Record<string, any>, seed?: number}} context ready.info and seed
 * @returns {import('./scene.js').Layer} terrain layer
 */
export function createTerrainLayer({ info, seed = 0 }) {
    const hasBasins = info.terrain?.layout === 'basins';
    const group = new Group();
    const frostUniforms = {
        uFrostTex: { value: null },
        uFrostColor: { value: PALETTE.frost },
        uColdMargin: { value: info.terrain?.coldMarginWidth ?? 0 },
        uWorld: { value: [info.worldWidth, info.worldHeight] },
        uTime: { value: 0 },
        uTier: { value: 0 },
    };
    const refugeUniforms = {
        uGlowColor: { value: PALETTE.refugeGlow },
        uSceneryMax: { value: SCENERY_MAX_LUMINANCE },
        uTime: { value: 0 },
    };

    const { frost, refuge } = buildTerrainMeshes(hasBasins, info, seed, {
        frost: frostUniforms,
        refuge: refugeUniforms,
    });
    if (frost) {
        group.add(frost.mesh);
    }
    if (refuge) {
        group.add(refuge.mesh);
    }
    group.visible = hasBasins;

    return {
        object: group,
        setLook(look) {
            const tier = look.terrain === 0 ? 0 : look.terrain === 1 ? 1 : 2;
            group.visible = hasBasins && tier < 2;
            frostUniforms.uTier.value = tier;
        },
        update(frame) {
            const t = frame.nowMs * 0.001;
            frostUniforms.uTime.value = t;
            refugeUniforms.uTime.value = t;
        },
        dispose: () => disposeTerrain(frost, refuge),
    };
}
