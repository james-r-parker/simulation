// A dim, speckled marker for living dung zones, packed from the snapshot only.

import { NormalBlending, ShaderMaterial } from 'three';
import { createSections, ZONE_STRIDE, readSections } from '../snapshot-view.js';
import { SCENERY_MAX_LUMINANCE } from './colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';

const MARK_RADIUS = 46;
const DUNG_LUMINANCE = 0.5 * SCENERY_MAX_LUMINANCE;
const DUNG_COLOR = [0.012, 0.009, 0.006];
const DUNG_COLOR_Y = 0.2126729 * DUNG_COLOR[0] + 0.7151522 * DUNG_COLOR[1] + 0.072175 * DUNG_COLOR[2];
const SCALE = DUNG_LUMINANCE / DUNG_COLOR_Y;
const SECTIONS = createSections();

const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody; // x, y, radius, remaining fertility
attribute vec4 iTint; // RGB at half the scenery ceiling
uniform float uZoom;
varying vec2 vLocal;
varying float vFertility;
varying vec3 vTint;
void main() {
    float radius = max(iBody.z, 2.0 / uZoom);
    vLocal = corner;
    vFertility = clamp(iBody.w, 0.0, 1.0);
    vTint = iTint.rgb;
    gl_Position = projectionMatrix * viewMatrix * vec4(iBody.xy + corner * radius, 0.0, 1.0);
}
`;

const DUNG_NOISE = /* glsl */ `
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
`;

const FRAGMENT = /* glsl */ `
${DUNG_NOISE}
varying vec2 vLocal;
varying float vFertility;
varying vec3 vTint;
void main() {
    float edge = 1.0 - smoothstep(0.35, 1.0, length(vLocal));
    float speckle = step(0.64, hash21(floor(vLocal * vec2(8.0, 6.0))));
    float alpha = edge * speckle * vFertility * 0.75;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vTint * alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/**
 * Packs only dung-origin zones as x, y, mark radius and remaining fertility.
 * @param {Float32Array} f32 snapshot floats
 * @param {Uint32Array} u32 snapshot words
 * @param {{zoneStart: number, zoneCount: number}} section zone records
 * @param {{origin: number, body: Float32Array, tint: Float32Array}} out reusable arrays and dung origin value
 * @returns {number} marks written
 */
export function packDungMarks(f32, u32, section, out) {
    let written = 0;
    const capacity = Math.min(out.body.length, out.tint.length) / VEC4;
    for (let i = 0; i < section.zoneCount && written < capacity; i++) {
        const source = section.zoneStart + i * ZONE_STRIDE;
        if (u32[source + 3] !== out.origin) {
            continue;
        }
        const target = written * VEC4;
        out.body[target] = f32[source];
        out.body[target + 1] = f32[source + 1];
        out.body[target + 2] = MARK_RADIUS;
        out.body[target + 3] = Math.max(0, Math.min(1, f32[source + 2]));
        out.tint[target] = DUNG_COLOR[0] * SCALE;
        out.tint[target + 1] = DUNG_COLOR[1] * SCALE;
        out.tint[target + 2] = DUNG_COLOR[2] * SCALE;
        out.tint[target + 3] = 1;
        written++;
    }
    return written;
}

/** @param {{info: Record<string, any>, layout: Record<string, any>}} context ready info and layout @returns {import('./scene.js').Layer} the dung-zone marks */
export function createDungLayer({ info, layout }) {
    const capacity = info.fertileZoneMax;
    const geometry = createQuadGeometry(capacity, ['iBody', 'iTint']);
    const material = new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uZoom: { value: 1 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: NormalBlending,
    });
    const mesh = createQuadMesh(geometry, material, capacity);
    const out = {
        origin: layout.zoneOrigins.DUNG,
        body: new Float32Array(capacity * VEC4),
        tint: new Float32Array(capacity * VEC4),
    };
    return {
        object: mesh,
        update(frame) {
            material.uniforms.uZoom.value = frame.camera.zoom;
            if (frame.snapshot === null || capacity === 0) {
                mesh.count = 0;
                return;
            }
            const section = readSections(frame.snapshot.u32, SECTIONS);
            uploadInstances(
                mesh,
                { iBody: out.body, iTint: out.tint },
                packDungMarks(frame.snapshot.f32, frame.snapshot.u32, section, out),
            );
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
