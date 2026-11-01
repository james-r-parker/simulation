// The static parts of the world: food dots, obstacle discs and the border line. Food and obstacles are
// instanced meshes fed from the newest snapshot with the count set per frame.

import {
    AdditiveBlending,
    BufferGeometry,
    DynamicDrawUsage,
    Float32BufferAttribute,
    Group,
    InstancedBufferAttribute,
    LineBasicMaterial,
    LineLoop,
    ShaderMaterial,
} from 'three';
import { createSections, FOOD_STRIDE, readSections } from '../snapshot-view.js';
import { PALETTE, SCENERY_MAX_LUMINANCE } from './colors.js';
import { smoothstep } from './curves.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { LOOK_OFF } from './quality.js';
import { packRockShape, rockShape, SHAPE_FLOATS } from './rock-shape.js';
import { FOOD_FRAGMENT, FOOD_VERTEX, OBSTACLE_FRAGMENT, OBSTACLE_VERTEX } from './world-layers-shader.js';

/** The food dot's colour intensity, and its smallest radius in device pixels. */
export const FOOD_INTENSITY = 0.4;
const FOOD_MIN_PX = 1.4;
/** The obstacle's rim width in device pixels. */
export const OBSTACLE_RIM_PX = 2;

const SECTIONS = createSections();
const PART = { start: 0, count: 0 };

/**
 * @param {number} start the first float of the records
 * @param {number} count how many records
 * @returns {{start: number, count: number}} a shared scratch, valid until the next call
 */
function bodyPart(start, count) {
    PART.start = start;
    PART.count = count;
    return PART;
}

/**
 * Packs `x, y, radius, phase` records from a snapshot's records. The phase offsets each dot's twinkle by its
 * position. The radius keeps its sign: a negative food radius marks meat, and the vertex shader takes `abs` for the size
 * and reads the sign as the kind.
 * @param {Float32Array} f32 the snapshot's floats
 * @param {{start: number, count: number}} part where the records are and how many
 * @param {Float32Array} out `capacity x 4` floats
 * @param {number} [stride=3] words per record in the snapshot
 * @returns {number} the records written, at most the capacity
 */
export function packBodies(f32, part, out, stride = 3) {
    const count = Math.min(part.count, out.length / VEC4);
    for (let i = 0; i < count; i++) {
        const w = part.start + i * stride;
        const o = i * VEC4;
        out[o] = f32[w];
        out[o + 1] = f32[w + 1];
        out[o + 2] = f32[w + 2];
        out[o + 3] = f32[w] * 0.013 + f32[w + 1] * 0.007;
    }
    return count;
}

/**
 * Packs the age01 values from the food records.
 * @param {Float32Array} f32 snapshot floats
 * @param {{start: number, count: number}} part food section
 * @param {Float32Array} out target array for age01
 * @returns {number} count of ages written
 */
export function packFoodAges(f32, part, out) {
    const count = Math.min(part.count, out.length);
    for (let i = 0; i < count; i++) {
        out[i] = f32[part.start + i * FOOD_STRIDE + 3];
    }
    return count;
}

/**
 * Packs species and hue from each food snapshot record.
 * @param {Float32Array} f32 snapshot floats
 * @param {{start: number, count: number}} part food section
 * @param {Float32Array} out target pairs
 * @returns {number} pairs written
 */
export function packFoodLook(f32, part, out) {
    const count = Math.min(part.count, out.length / 2);
    for (let i = 0; i < count; i++) {
        const at = part.start + i * FOOD_STRIDE;
        out[i * 2] = f32[at + 4];
        out[i * 2 + 1] = f32[at + 5];
    }
    return count;
}

/**
 * Returns dimming and scale factors for carcass decay.
 * @param {number} age01 normalized age 0..1
 * @returns {{dim: number, scale: number}}
 */
export function carcassLook(age01) {
    const a = Math.max(0, Math.min(1, age01));
    return {
        dim: 1 - 0.65 * smoothstep(0.1, 1, a),
        scale: 1 - 0.4 * a,
    };
}

/**
 * @param {Record<string, any>} options material parameters
 * @returns {any} a transparent shader material
 */
function material(options) {
    return new ShaderMaterial({
        ...options,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
}

/**
 * @param {number} capacity maximum food records
 * @returns {ReturnType<typeof createQuadGeometry>} food quad geometry
 */
function foodGeometry(capacity) {
    const geometry = createQuadGeometry(capacity, ['iBody']);
    const ageAttr = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    ageAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('iAge', ageAttr);
    const lookAttr = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    lookAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('iLook', lookAttr);
    return geometry;
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the food dots: four-point sparkles in plant teal or meat amber
 */
export function createFoodLayer({ info }) {
    const uniforms = {
        uZoom: { value: 1 },
        uPad: { value: 6 },
        uMinPx: { value: FOOD_MIN_PX },
        uColor: { value: PALETTE.food },
        uMeatColor: { value: PALETTE.meat },
        uIntensity: { value: FOOD_INTENSITY },
        uTime: { value: 0 },
        uDecay: { value: 1 },
        uFlora: { value: 1 },
    };
    const geometry = foodGeometry(info.maxFood);
    const mat = material({
        vertexShader: FOOD_VERTEX,
        fragmentShader: FOOD_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
    });
    const mesh = createQuadMesh(geometry, mat, info.maxFood);
    const packed = new Float32Array(info.maxFood * VEC4);
    const packedAges = new Float32Array(info.maxFood);
    const packedLook = new Float32Array(info.maxFood * 2);
    return {
        object: mesh,
        setLook(look) {
            uniforms.uDecay.value = look.decay === LOOK_OFF ? 0 : 1;
            uniforms.uFlora.value = look.flora === LOOK_OFF ? 0 : 1;
        },
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            uniforms.uTime.value = frame.nowMs * 0.001;
            if (frame.snapshot === null) {
                mesh.count = 0;
                return;
            }
            const s = readSections(frame.snapshot.u32, SECTIONS);
            const count = packBodies(frame.snapshot.f32, bodyPart(s.foodStart, s.foodCount), packed, FOOD_STRIDE);
            packFoodAges(frame.snapshot.f32, bodyPart(s.foodStart, s.foodCount), packedAges);
            packFoodLook(frame.snapshot.f32, bodyPart(s.foodStart, s.foodCount), packedLook);
            uploadInstances(mesh, { iBody: packed, iAge: packedAges, iLook: packedLook }, count);
        },
        dispose() {
            geometry.dispose();
            mat.dispose();
            mesh.dispose();
        },
    };
}

/**
 * @param {number} count obstacle count
 * @param {number} seed world seed
 * @returns {Float32Array} packed shape attributes
 */
function initObstacleShapes(count, seed) {
    const packed = new Float32Array(count * VEC4);
    const scratch = new Float32Array(SHAPE_FLOATS);
    for (let i = 0; i < count; i++) {
        rockShape(seed, i, scratch);
        packRockShape(scratch, packed, i * VEC4);
    }
    return packed;
}

/**
 * @param {number} pass 0 for rim, 1 for body
 * @returns {Record<string, {value: any}>} uniform dictionary
 */
function obstacleUniforms(pass) {
    return {
        uZoom: { value: 1 },
        uPad: { value: 2 },
        uMinPx: { value: 2 },
        uBody: { value: PALETTE.rockBody },
        uRim: { value: PALETTE.rockRim },
        uContact: { value: PALETTE.rockContact },
        uLichen: { value: PALETTE.lichen },
        uSceneryMax: { value: SCENERY_MAX_LUMINANCE },
        uRimPx: { value: OBSTACLE_RIM_PX },
        uTime: { value: 0 },
        uTier: { value: 0 },
        uPass: { value: pass },
    };
}

/**
 * @param {any} geometry shared quad geometry
 * @param {Record<string, {value: any}>} rimUniforms rim uniforms
 * @param {Record<string, {value: any}>} bodyUniforms body uniforms
 * @param {number} count instance count
 */
function createObstacleMeshes(geometry, rimUniforms, bodyUniforms, count) {
    const rimMat = material({
        vertexShader: OBSTACLE_VERTEX,
        fragmentShader: OBSTACLE_FRAGMENT,
        uniforms: rimUniforms,
    });
    const bodyMat = material({
        vertexShader: OBSTACLE_VERTEX,
        fragmentShader: OBSTACLE_FRAGMENT,
        uniforms: bodyUniforms,
    });
    const rimMesh = createQuadMesh(geometry, rimMat, count);
    const bodyMesh = createQuadMesh(geometry, bodyMat, count);
    rimMesh.renderOrder = 0;
    bodyMesh.renderOrder = 1;

    const group = new Group();
    group.add(rimMesh);
    group.add(bodyMesh);
    Object.defineProperty(group, 'count', {
        get() {
            return rimMesh.count;
        },
        set(v) {
            rimMesh.count = v;
            bodyMesh.count = v;
        },
    });
    Object.defineProperty(group, 'material', {
        get() {
            return rimMat;
        },
    });
    return { rimMat, bodyMat, rimMesh, bodyMesh, group };
}

/**
 * @param {{info: Record<string, any>, seed?: number}} context `ready.info` and seed
 * @returns {import('./scene.js').Layer} two-pass rock obstacles with rim and shaded body
 */
export function createObstacleLayer({ info, seed = 0 }) {
    const count = info.obstacleCount;
    const geometry = createQuadGeometry(count, ['iBody', 'iShape']);
    geometry.getAttribute('iShape').copyArray(initObstacleShapes(count, seed));
    geometry.getAttribute('iShape').needsUpdate = true;

    const rimUniforms = obstacleUniforms(0);
    const bodyUniforms = obstacleUniforms(1);
    const { rimMat, bodyMat, rimMesh, bodyMesh, group } = createObstacleMeshes(
        geometry,
        rimUniforms,
        bodyUniforms,
        count,
    );
    const packed = new Float32Array(count * VEC4);

    return {
        object: group,
        setLook(look) {
            const tier = look.rocks === 0 ? 0 : look.rocks === 1 ? 1 : 2;
            rimUniforms.uTier.value = tier;
            bodyUniforms.uTier.value = tier;
        },
        update(frame) {
            rimUniforms.uZoom.value = frame.camera.zoom;
            bodyUniforms.uZoom.value = frame.camera.zoom;
            rimUniforms.uTime.value = frame.nowMs * 0.001;
            bodyUniforms.uTime.value = frame.nowMs * 0.001;
            if (frame.snapshot === null) {
                group.count = 0;
                return;
            }
            const s = readSections(frame.snapshot.u32, SECTIONS);
            const n = packBodies(frame.snapshot.f32, bodyPart(s.obstacleStart, s.obstacleCount), packed);
            uploadInstances(rimMesh, { iBody: packed }, n);
            uploadInstances(bodyMesh, { iBody: packed }, n);
        },
        dispose() {
            geometry.dispose();
            rimMat.dispose();
            bodyMat.dispose();
            rimMesh.dispose();
            bodyMesh.dispose();
        },
    };
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the world border: a 1 px line at 6% white
 */
export function createBorderLayer({ info }) {
    const { worldWidth: w, worldHeight: h } = info;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0], 3));
    const mat = new LineBasicMaterial({ depthTest: false, depthWrite: false });
    mat.color.setRGB(...PALETTE.border);
    const line = new LineLoop(geometry, mat);
    line.frustumCulled = false;
    return {
        object: line,
        dispose() {
            geometry.dispose();
            mat.dispose();
        },
    };
}
