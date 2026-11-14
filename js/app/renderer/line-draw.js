// Crisp lines: each vertex pair of a `LineBuffer` becomes an instanced capsule of a fixed width in device pixels,
// anti-aliased over one pixel and drawn additively, so tethers, threads, trails, rays and rings stay sharp at any zoom.
// A drop-in for the deleted `line-mesh.js`: the same `{object, upload, dispose}`.

import { AdditiveBlending, MeshBasicNodeMaterial } from 'three/webgpu';
import {
    attribute,
    cameraProjectionMatrix,
    clamp,
    dot,
    float,
    length,
    max,
    normalize,
    positionGeometry,
    screenSize,
    smoothstep,
    varying,
    vec2,
    vec3,
} from 'three/tsl';
import { createInstances, instancedMesh, uploadInstances } from './instances.js';
import { createLineBuffer, pushVertex, setLineColor } from './line-buffer.js';
import { PALETTE } from './colors.js';
import { toDisplay } from './palette.js';

/** The default stroke width, device px. */
export const LINE_PX = 1.5;

/**
 * Copies the buffer's vertex pairs into segment rows: ends and the display colour scaled by the pair's alpha.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {{seg: Float32Array, color: Float32Array}} out the instance arrays
 * @param {number[]} rgb scratch
 * @returns {number} the segments written
 */
export function packSegments(lines, out, rgb) {
    const count = Math.min(lines.vertices >> 1, out.seg.length / 4);
    for (let s = 0; s < count; s++) {
        const v = s * 2;
        out.seg[s * 4] = lines.position[v * 3];
        out.seg[s * 4 + 1] = lines.position[v * 3 + 1];
        out.seg[s * 4 + 2] = lines.position[v * 3 + 3];
        out.seg[s * 4 + 3] = lines.position[v * 3 + 4];
        rgb[0] = lines.color[v * 4];
        rgb[1] = lines.color[v * 4 + 1];
        rgb[2] = lines.color[v * 4 + 2];
        toDisplay(rgb, rgb);
        const a = Math.min(Math.max(lines.color[v * 4 + 3], 0), 1);
        out.color[s * 4] = rgb[0] * a;
        out.color[s * 4 + 1] = rgb[1] * a;
        out.color[s * 4 + 2] = rgb[2] * a;
        out.color[s * 4 + 3] = a;
    }
    return count;
}

/** @param {number} widthPx the stroke width @returns {any} the capsule material */
function lineMaterial(widthPx) {
    const seg = attribute('iSeg', 'vec4');
    const color = attribute('iColor', 'vec4');
    const a = seg.xy;
    const b = seg.zw;
    const pxWorld = float(2).div(cameraProjectionMatrix.element(0).x.mul(screenSize.x));
    const half = float(widthPx / 2 + 1).mul(pxWorld);
    const delta = b.sub(a);
    const dir = normalize(delta.add(vec2(1e-6, 0)));
    const across = vec2(dir.y.negate(), dir.x);
    const corner = positionGeometry.xy;
    const along = a.add(delta.mul(corner.x.add(1).mul(0.5))).add(dir.mul(corner.x.mul(half)));
    const world = along.add(across.mul(corner.y.mul(half)));
    const material = new MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.blending = AdditiveBlending;
    material.positionNode = vec3(world, 0);
    const p = varying(world);
    const pa = p.sub(a);
    const h = clamp(dot(pa, delta).div(max(dot(delta, delta), 1e-8)), 0, 1);
    const dPx = length(pa.sub(delta.mul(h))).div(pxWorld);
    const cover = smoothstep(float(widthPx / 2 - 0.5), float(widthPx / 2 + 0.5), dPx).oneMinus();
    material.colorNode = color.xyz.mul(cover);
    return material;
}

/**
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer the layer fills each frame
 * @param {{widthPx?: number}} [style] the stroke width in device px
 * @returns {{object: any, upload: () => void, dispose: () => void}} the mesh, the per-frame upload and the cleanup
 */
export function createLineMesh(lines, { widthPx = LINE_PX } = {}) {
    const capacity = Math.max(lines.capacity >> 1, 1);
    const instances = createInstances(capacity, ['iSeg', 'iColor']);
    const out = { seg: instances.arrays.iSeg, color: instances.arrays.iColor };
    const rgb = [0, 0, 0];
    const material = lineMaterial(widthPx);
    return {
        object: instancedMesh(instances, material),
        upload() {
            uploadInstances(instances, packSegments(lines, out, rgb));
        },
        dispose() {
            instances.geometry.dispose();
            material.dispose();
        },
    };
}

/**
 * @param {{info: Record<string, any>}} context `ready.info` (world size)
 * @returns {import('./stage.js').Layer} the world border as a crisp rim
 */
export function createBorderLines({ info }) {
    const lines = createLineBuffer(4);
    const { worldWidth: w, worldHeight: h } = info;
    setLineColor(lines, PALETTE.border, 0.9);
    const corners = [0, 0, w, 0, w, h, 0, h, 0, 0];
    for (let k = 0; k < 4; k++) {
        pushVertex(lines, corners[k * 2], corners[k * 2 + 1]);
        pushVertex(lines, corners[k * 2 + 2], corners[k * 2 + 3]);
    }
    const mesh = createLineMesh(lines);
    mesh.upload();
    return { object: mesh.object, dispose: mesh.dispose };
}
