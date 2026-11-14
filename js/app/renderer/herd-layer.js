// Draws the megafauna from the snapshot: shaped, group-coloured bodies, or plain discs when the `herds` look item is
// off. The animals are always drawn, because they trample blobs at every quality level.

import { NormalBlending, ShaderMaterial } from 'three';
import { createSections, HERD_STRIDE, readSections } from '../snapshot-view.js';
import { herdColor } from './herd-colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { HERD_FRAGMENT, HERD_VERTEX } from './herd-layer-shader.js';
import { LOOK_OFF } from './quality.js';

const SECTIONS = createSections();
const MIN_PX = 8;
const COLOR = [0, 0, 0];
const PHASE_STEP = 2.399963229728653;
/** `uDetail` values: 0 full (gait, nod, relief), 1 reduced (static shape), 2 the plain disc. */
const DETAIL_PLAIN = 2;

/** @param {Float32Array} f32 snapshot floats @param {Uint32Array} u32 snapshot words @param {{herdStart: number, herdCount: number}} section herd records @param {{body: Float32Array, motion: Float32Array, colors: Float32Array, radius: number}} out packed instance attributes and the animal radius (`ready.info.herdRadius`) @returns {number} rows written */
export function packHerdBodies(f32, u32, section, out) {
    const { body, motion, colors, radius } = out;
    const count = Math.min(section.herdCount, body.length / VEC4, motion.length / VEC4, colors.length / VEC4);
    for (let i = 0; i < count; i++) {
        const source = section.herdStart + i * HERD_STRIDE;
        const target = i * VEC4;
        const group = u32[source + 5];
        body[target] = f32[source];
        body[target + 1] = f32[source + 1];
        body[target + 2] = radius;
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

/** @param {any} state reusable layer state @param {any} frame the current render frame @returns {void} */
function updateHerdLayer(state, frame) {
    const { mesh, uniforms, packedBody, packedMotion, packedColor, radius } = state;
    uniforms.uZoom.value = frame.camera.zoom;
    uniforms.uTime.value = Number.isFinite(frame.nowMs) ? frame.nowMs / 1000 : 0;
    if (frame.snapshot === null) {
        mesh.count = 0;
        mesh.visible = false;
        return;
    }
    const section = readSections(frame.snapshot.u32, SECTIONS);
    const count = packHerdBodies(frame.snapshot.f32, frame.snapshot.u32, section, {
        body: packedBody,
        motion: packedMotion,
        colors: packedColor,
        radius,
    });
    uploadInstances(mesh, { iBody: packedBody, iMotion: packedMotion, iColor: packedColor }, count);
    mesh.visible = count > 0;
}

/** @param {{info: Record<string, any>}} context ready.info (`herdMax`, `herdRadius`) @returns {import('./scene.js').Layer} the herd bodies */
export function createHerdLayer({ info }) {
    const capacity = info.herdMax;
    const geometry = createQuadGeometry(capacity, ['iBody', 'iMotion', 'iColor']);
    const uniforms = {
        uZoom: { value: 1 },
        uMinPx: { value: MIN_PX },
        uTime: { value: 0 },
        uDetail: { value: 0 },
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
    const state = {
        mesh,
        uniforms,
        packedBody: new Float32Array(capacity * VEC4),
        packedMotion: new Float32Array(capacity * VEC4),
        packedColor: new Float32Array(capacity * VEC4),
        radius: info.herdRadius,
    };
    return {
        object: mesh,
        setLook(look) {
            uniforms.uDetail.value = look.herds === LOOK_OFF ? DETAIL_PLAIN : Math.min(look.herds ?? 0, 1);
        },
        update(frame) {
            updateHerdLayer(state, frame);
        },
        dispose() {
            geometry.dispose();
            mat.dispose();
            mesh.dispose();
        },
    };
}
