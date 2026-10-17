// Smoke: one `InstancedMesh` of up to `maxClouds` puffs drawn over the agents, and the same puffs' alpha rendered into
// a quarter-resolution target that the agent shader reads, so smoke dims the glow before the bloom threshold.

import { CustomBlending, LinearFilter, MaxEquation, OneFactor, Scene, ShaderMaterial, WebGLRenderTarget } from 'three';
import { createSections, readSections } from '../snapshot-view.js';
import { PALETTE } from './colors.js';
import { easeOut, smoothstep } from './curves.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { SMOKE_FRAGMENT, SMOKE_VERTEX } from './smoke-layer-shader.js';

/** The target is this many times smaller than the canvas on each side. */
export const TARGET_DIVISOR = 4;
const SECTIONS = createSections();

/**
 * The shape of a puff over its life.
 * @param {number} life 1 when the cloud is new, 0 when it ends (the third snapshot word)
 * @param {{radiusScale: number, alpha: number}} [out] receives the result
 * @returns {{radiusScale: number, alpha: number}} `radiusScale` is 0.5 growing to 1 over the first quarter of its
 *   age; `alpha` is 0.55, fading to 0 from 55% of its age
 */
export function smokeShape(life, out = { radiusScale: 0, alpha: 0 }) {
    const age = 1 - life;
    out.radiusScale = 0.5 + 0.5 * easeOut(Math.min(age / 0.25, 1));
    out.alpha = 0.55 * (1 - smoothstep(0.55, 1, age));
    return out;
}

const SHAPE = { radiusScale: 0, alpha: 0 };

/**
 * Packs the live clouds as `x, y, radius, alpha`.
 * @param {Float32Array} f32 the snapshot's floats
 * @param {{start: number, count: number}} part where the cloud records are
 * @param {{smokeRadius: number, out: Float32Array}} target the cloud radius and `capacity x 4` floats to fill
 * @returns {number} the clouds written
 */
export function packClouds(f32, part, target) {
    const count = Math.min(part.count, target.out.length / VEC4);
    for (let i = 0; i < count; i++) {
        const w = part.start + i * 3;
        const o = i * VEC4;
        smokeShape(f32[w + 2], SHAPE);
        target.out[o] = f32[w];
        target.out[o + 1] = f32[w + 1];
        target.out[o + 2] = target.smokeRadius * SHAPE.radiusScale;
        target.out[o + 3] = SHAPE.alpha;
    }
    return count;
}

/**
 * @param {Record<string, any>} uniforms shared uniforms
 * @param {boolean} alphaOnly whether this draws the alpha target's version
 * @returns {any} a puff material
 */
function puffMaterial(uniforms, alphaOnly) {
    return new ShaderMaterial({
        vertexShader: SMOKE_VERTEX,
        fragmentShader: SMOKE_FRAGMENT,
        uniforms,
        defines: alphaOnly ? { ALPHA_ONLY: '' } : {},
        transparent: true,
        depthTest: false,
        depthWrite: false,
        ...(alphaOnly
            ? { blending: CustomBlending, blendEquation: MaxEquation, blendSrc: OneFactor, blendDst: OneFactor }
            : {}),
    });
}

/**
 * @returns {Record<string, {value: any}>} the puff uniforms
 */
function smokeUniforms() {
    return { uTime: { value: 0 }, uSmoke: { value: PALETTE.smoke }, uNoise: { value: PALETTE.smokeNoise } };
}

/**
 * Clears the alpha target and draws the puffs' alpha into it.
 * @param {{renderer: any, camera: any, target: any, scene: any}} job what to draw and where
 * @returns {void}
 */
function renderAlpha({ renderer, camera, target, scene }) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer & {texture: any}} the layer; `texture` is the alpha target for
 *   `setSmokeTexture` on the agents layer
 */
export function createSmokeLayer({ info }) {
    const uniforms = smokeUniforms();
    const geometry = createQuadGeometry(info.maxClouds, ['iCloud']);
    const puffs = createQuadMesh(geometry, puffMaterial(uniforms, false), info.maxClouds);
    const alphaMesh = createQuadMesh(geometry, puffMaterial(uniforms, true), info.maxClouds);
    const alphaScene = new Scene();
    alphaScene.add(alphaMesh);
    const target = new WebGLRenderTarget(2, 2, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
    });
    const packed = new Float32Array(info.maxClouds * VEC4);
    let dirty = true;
    return {
        object: puffs,
        texture: target.texture,
        resize: (w, h) => target.setSize(Math.ceil(w / TARGET_DIVISOR), Math.ceil(h / TARGET_DIVISOR)),
        update(frame) {
            uniforms.uTime.value = frame.nowMs / 1000;
            if (frame.snapshot === null) {
                return;
            }
            const s = readSections(frame.snapshot.u32, SECTIONS);
            const count = packClouds(
                frame.snapshot.f32,
                { start: s.cloudStart, count: s.cloudCount },
                { smokeRadius: info.smokeRadius, out: packed },
            );
            uploadInstances(puffs, { iCloud: packed }, count);
            alphaMesh.count = count;
            alphaMesh.visible = count > 0;
            dirty = dirty || count > 0;
        },
        prerender(renderer, camera) {
            if (dirty) {
                renderAlpha({ renderer, camera, target, scene: alphaScene });
                dirty = alphaMesh.count > 0;
            }
        },
        dispose() {
            geometry.dispose();
            puffs.material.dispose();
            alphaMesh.material.dispose();
            target.dispose();
        },
    };
}
