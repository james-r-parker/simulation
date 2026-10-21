// The static parts of the world: food dots, obstacle discs and the border line. Food and obstacles are one
// `InstancedMesh` each, fed from the newest snapshot with the count set per frame.

import {
    AdditiveBlending,
    BufferGeometry,
    Float32BufferAttribute,
    LineBasicMaterial,
    LineLoop,
    ShaderMaterial,
} from 'three';
import { PALETTE } from './colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { createSections, readSections } from '../snapshot-view.js';
import { FOOD_FRAGMENT, FOOD_VERTEX, OBSTACLE_FRAGMENT, OBSTACLE_VERTEX } from './world-layers-shader.js';

/** The food dot's colour intensity, and its smallest radius in device pixels. */
export const FOOD_INTENSITY = 0.7;
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
 * Packs `x, y, radius, phase` records from a snapshot's 3-word records. The phase offsets each dot's twinkle by its
 * position. The radius keeps its sign: a negative food radius marks meat, and the vertex shader takes `abs` for the size
 * and reads the sign as the kind.
 * @param {Float32Array} f32 the snapshot's floats
 * @param {{start: number, count: number}} part where the records are and how many
 * @param {Float32Array} out `capacity x 4` floats
 * @returns {number} the records written, at most the capacity
 */
export function packBodies(f32, part, out) {
    const count = Math.min(part.count, out.length / VEC4);
    for (let i = 0; i < count; i++) {
        const w = part.start + i * 3;
        const o = i * VEC4;
        out[o] = f32[w];
        out[o + 1] = f32[w + 1];
        out[o + 2] = f32[w + 2];
        out[o + 3] = f32[w] * 0.013 + f32[w + 1] * 0.007;
    }
    return count;
}

/**
 * @param {Record<string, any>} options the material parts
 * @returns {any} a shader material that draws without depth
 */
function material(options) {
    return new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, ...options });
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the food dots, drawn additively
 */
export function createFoodLayer({ info }) {
    const uniforms = {
        uZoom: { value: 1 },
        uPad: { value: 3 },
        uMinPx: { value: FOOD_MIN_PX },
        uTime: { value: 0 },
        uColor: { value: PALETTE.food },
        uMeatColor: { value: PALETTE.meat },
        uIntensity: { value: FOOD_INTENSITY },
    };
    const geometry = createQuadGeometry(info.maxFood, ['iBody']);
    const mat = material({
        vertexShader: FOOD_VERTEX,
        fragmentShader: FOOD_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
    });
    const mesh = createQuadMesh(geometry, mat, info.maxFood);
    const packed = new Float32Array(info.maxFood * VEC4);
    return {
        object: mesh,
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            uniforms.uTime.value = frame.nowMs / 1000;
            if (frame.snapshot === null) {
                return;
            }
            const s = readSections(frame.snapshot.u32, SECTIONS);
            const count = packBodies(frame.snapshot.f32, bodyPart(s.foodStart, s.foodCount), packed);
            uploadInstances(mesh, { iBody: packed }, count);
        },
        dispose() {
            geometry.dispose();
            mat.dispose();
            mesh.dispose();
        },
    };
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the obstacles: near-black discs with a 2 px rim, drawn over the haze and food
 */
export function createObstacleLayer({ info }) {
    const uniforms = {
        uZoom: { value: 1 },
        uPad: { value: 2 },
        uMinPx: { value: 2 },
        uBody: { value: PALETTE.obstacleBody },
        uRim: { value: PALETTE.obstacleRim },
        uRimPx: { value: OBSTACLE_RIM_PX },
    };
    const geometry = createQuadGeometry(info.obstacleCount, ['iBody']);
    const mat = material({ vertexShader: OBSTACLE_VERTEX, fragmentShader: OBSTACLE_FRAGMENT, uniforms });
    const mesh = createQuadMesh(geometry, mat, info.obstacleCount);
    const packed = new Float32Array(info.obstacleCount * VEC4);
    return {
        object: mesh,
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            if (frame.snapshot === null) {
                return;
            }
            const s = readSections(frame.snapshot.u32, SECTIONS);
            const count = packBodies(frame.snapshot.f32, bodyPart(s.obstacleStart, s.obstacleCount), packed);
            uploadInstances(mesh, { iBody: packed }, count);
        },
        dispose() {
            geometry.dispose();
            mat.dispose();
            mesh.dispose();
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
