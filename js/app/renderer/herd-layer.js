// Draws Phase 1 megafauna as plain, seeded snapshot discs.

import { AdditiveBlending, ShaderMaterial } from 'three';
import { createSections, readSections } from '../snapshot-view.js';
import { PALETTE, SCENERY_MAX_LUMINANCE } from './colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { HERD_FRAGMENT, HERD_VERTEX } from './world-layers-shader.js';

const SECTIONS = createSections();
const MIN_PX = 8;
const HERD_LUMINANCE =
    0.2126729 * PALETTE.coolWhite[0] + 0.7151522 * PALETTE.coolWhite[1] + 0.072175 * PALETTE.coolWhite[2];
const INTENSITY = SCENERY_MAX_LUMINANCE / HERD_LUMINANCE;

/** @param {Float32Array} f32 snapshot floats @param {{herdStart: number, herdCount: number}} section herd records @param {Float32Array} out packed bodies @returns {number} rows written */
export function packHerdBodies(f32, section, out) {
    const count = Math.min(section.herdCount, out.length / VEC4);
    for (let i = 0; i < count; i++) {
        const source = section.herdStart + i * 5;
        const target = i * VEC4;
        out[target] = f32[source];
        out[target + 1] = f32[source + 1];
        out[target + 2] = f32[source + 2];
        out[target + 3] = f32[source + 3];
    }
    return count;
}

/** @param {{info: Record<string, any>}} context ready.info @returns {import('./scene.js').Layer} herd discs */
export function createHerdLayer({ info }) {
    const capacity = info.herdMax;
    const geometry = createQuadGeometry(capacity, ['iBody']);
    const uniforms = {
        uZoom: { value: 1 },
        uMinPx: { value: MIN_PX },
        uColor: { value: PALETTE.coolWhite },
        uIntensity: { value: INTENSITY },
    };
    const mat = new ShaderMaterial({
        vertexShader: HERD_VERTEX,
        fragmentShader: HERD_FRAGMENT,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
    });
    const mesh = createQuadMesh(geometry, mat, capacity);
    const packed = new Float32Array(capacity * VEC4);
    return {
        object: mesh,
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            if (frame.snapshot === null) {
                mesh.count = 0;
                return;
            }
            const section = readSections(frame.snapshot.u32, SECTIONS);
            const count = packHerdBodies(frame.snapshot.f32, section, packed);
            uploadInstances(mesh, { iBody: packed }, count);
        },
        dispose() {
            geometry.dispose();
            mat.dispose();
            mesh.dispose();
        },
    };
}
