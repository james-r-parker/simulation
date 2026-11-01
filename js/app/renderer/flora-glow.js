// Draws living patch glows from the current snapshot's flora records.
import { AdditiveBlending, ShaderMaterial } from 'three';
import { createSections, PATCH_STRIDE, readSections } from '../snapshot-view.js';
import { SCENERY_MAX_LUMINANCE } from './colors.js';
import { floraColor } from './flora-colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances } from './instanced.js';

const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPatch;
attribute vec4 iTint;
varying vec2 vLocal;
varying vec4 vTint;
void main() {
    vLocal = corner;
    vTint = iTint;
    gl_Position = projectionMatrix * viewMatrix * vec4(iPatch.xy + corner * iPatch.z, 0.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying vec4 vTint;
void main() {
    float d = length(vLocal);
    if (d >= 1.0) discard;
    vec3 rgb = vTint.rgb * vTint.a * (1.0 - d) * (1.0 - d);
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

/**
 * @param {Float32Array} snapshot snapshot floats
 * @param {{patchStart: number, patchCount: number}} section patch part
 * @param {{pose: Float32Array, tint: Float32Array, radius: number, rgb: number[]}} out reusable buffers
 * @returns {number} number of packed patches
 */
export function packFloraGlows(snapshot, section, out) {
    const count = Math.min(section.patchCount, out.pose.length / 4);
    for (let i = 0; i < count; i++) {
        const from = section.patchStart + i * PATCH_STRIDE;
        const at = i * 4;
        out.pose[at] = snapshot[from];
        out.pose[at + 1] = snapshot[from + 1];
        out.pose[at + 2] = out.radius * 1.6;
        out.pose[at + 3] = 0;
        floraColor(snapshot[from + 3], out.rgb);
        const y = 0.2126729 * out.rgb[0] + 0.7151522 * out.rgb[1] + 0.072175 * out.rgb[2];
        const scale = SCENERY_MAX_LUMINANCE / y;
        out.tint[at] = out.rgb[0] * scale;
        out.tint[at + 1] = out.rgb[1] * scale;
        out.tint[at + 2] = out.rgb[2] * scale;
        out.tint[at + 3] = Math.max(0, Math.min(1, snapshot[from + 4]));
    }
    return count;
}

/**
 * @param {Record<string, any>} info world dimensions and patch capacity
 * @returns {{mesh: any, geom: any, mat: any, update: (snapshot: any) => void}} the preallocated glow mesh
 */
export function createFloraGlow(info) {
    const capacity = info.floraPatchMax ?? info.patches?.length ?? 0;
    const geom = createQuadGeometry(capacity, ['iPatch', 'iTint']);
    const mat = new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geom, mat, capacity);
    const out = {
        pose: new Float32Array(capacity * 4),
        tint: new Float32Array(capacity * 4),
        radius: info.foodPatchRadius ?? info.patches?.[0]?.radius ?? 0,
        rgb: [0, 0, 0],
    };
    const sources = { iPatch: out.pose, iTint: out.tint };
    const section = createSections();
    return {
        mesh,
        geom,
        mat,
        update(snapshot) {
            if (snapshot === null) {
                mesh.visible = false;
                return;
            }
            readSections(snapshot.u32, section);
            uploadInstances(mesh, sources, packFloraGlows(snapshot.f32, section, out));
        },
    };
}

/**
 * @param {{group: any, frost: any, refuge: any, patches: any, flora: any}} parts terrain parts
 * @param {boolean} terrainOn whether the terrain look is visible
 * @param {boolean} floraOn whether the flora look is visible
 * @returns {void}
 */
export function setFloraVisibility(parts, terrainOn, floraOn) {
    parts.group.visible = terrainOn || floraOn;
    if (parts.frost) {
        parts.frost.mesh.visible = terrainOn;
    }
    if (parts.refuge) {
        parts.refuge.mesh.visible = terrainOn;
    }
    if (parts.patches) {
        parts.patches.mesh.visible = terrainOn && !floraOn;
    }
    if (!floraOn && parts.flora) {
        parts.flora.mesh.visible = false;
    }
}

/** @param {any} flora optional dynamic glow @returns {void} */
export function disposeFloraGlow(flora) {
    if (flora) {
        flora.geom.dispose();
        flora.mat.dispose();
        flora.mesh.dispose();
    }
}
