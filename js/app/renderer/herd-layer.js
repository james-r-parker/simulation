// Draws Phase 1 megafauna as plain, seeded snapshot discs.

import { NormalBlending, ShaderMaterial } from 'three';
import { createSections, HERD_STRIDE, readSections } from '../snapshot-view.js';
import { herdColor } from './herd-colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { HERD_FRAGMENT, HERD_VERTEX } from './herd-layer-shader.js';

const SECTIONS = createSections();
const MIN_PX = 8;
const COLOR = [0, 0, 0];
const PHASE_STEP = 2.399963229728653;

/** @param {Float32Array} f32 snapshot floats @param {Uint32Array} u32 snapshot words @param {{herdStart: number, herdCount: number}} section herd records @param {{body: Float32Array, motion: Float32Array, colors: Float32Array}} out packed instance attributes @returns {number} rows written */
export function packHerdBodies(f32, u32, section, out) {
    const { body, motion, colors } = out;
    const count = Math.min(section.herdCount, body.length / VEC4, motion.length / VEC4, colors.length / VEC4);
    for (let i = 0; i < count; i++) {
        const source = section.herdStart + i * HERD_STRIDE;
        const target = i * VEC4;
        const group = u32[source + 5];
        body[target] = f32[source];
        body[target + 1] = f32[source + 1];
        body[target + 2] = f32[source + 2];
        body[target + 3] = f32[source + 3];
        motion[target] = f32[source + 4];
        motion[target + 1] = (group * 7 + i) * PHASE_STEP;
        motion[target + 2] = group;
        motion[target + 3] = 0;
        herdColor(group, COLOR);
        colors[target] = COLOR[0];
        colors[target + 1] = COLOR[1];
        colors[target + 2] = COLOR[2];
        colors[target + 3] = 1;
    }
    return count;
}

/** @param {{info: Record<string, any>}} context ready.info @returns {import('./scene.js').Layer} herd discs */
export function createHerdLayer({ info }) {
    const capacity = info.herdMax;
    const geometry = createQuadGeometry(capacity, ['iBody', 'iMotion', 'iColor']);
    const uniforms = {
        uZoom: { value: 1 },
        uMinPx: { value: MIN_PX },
        uTime: { value: 0 },
    };
    const mat = new ShaderMaterial({
        vertexShader: HERD_VERTEX,
        fragmentShader: HERD_FRAGMENT,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: NormalBlending,
    });
    const mesh = createQuadMesh(geometry, mat, capacity);
    const packedBody = new Float32Array(capacity * VEC4);
    const packedMotion = new Float32Array(capacity * VEC4);
    const packedColor = new Float32Array(capacity * VEC4);
    return {
        object: mesh,
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            uniforms.uTime.value = Number.isFinite(frame.nowMs) ? frame.nowMs / 1000 : 0;
            if (frame.snapshot === null) {
                mesh.count = 0;
                return;
            }
            const section = readSections(frame.snapshot.u32, SECTIONS);
            const count = packHerdBodies(frame.snapshot.f32, frame.snapshot.u32, section, {
                body: packedBody,
                motion: packedMotion,
                colors: packedColor,
            });
            uploadInstances(mesh, { iBody: packedBody, iMotion: packedMotion, iColor: packedColor }, count);
        },
        dispose() {
            geometry.dispose();
            mat.dispose();
            mesh.dispose();
        },
    };
}
