// Off-view pointers: a notable moment (the live moment log) that happened outside the view in the last
// `POINTER_MS` shows a chevron at the edge of the view, pointing at it and fading, so a viewer driving the camera sees
// where something just happened. At most `MOMENT_LOG_SIZE` chevrons, packed into preallocated arrays.

import { AdditiveBlending, ShaderMaterial } from 'three';
import { viewBounds } from '../camera.js';
import { MOMENT_LOG_SIZE } from '../director/moment-log.js';
import { PALETTE } from './colors.js';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from './instanced.js';
import { LOOK_OFF } from './quality.js';

/** How long a pointer shows, ms. */
export const POINTER_MS = 3000;
/** How far inside the view edge a pointer sits, and its size, in device px. */
export const POINTER_INSET_PX = 36;
export const POINTER_PX = 18;
const KILLS = new Set(['kill', 'pack-kill', 'trample']);

const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPose;   // x, y, angle, size (world)
attribute vec4 iColor;  // r, g, b, alpha
varying vec2 vP;
varying vec4 vColor;
void main() {
    vP = corner;
    vColor = iColor;
    vec2 dir = vec2(cos(iPose.z), sin(iPose.z));
    vec2 local = corner * iPose.w;
    vec2 world = iPose.xy + vec2(dir.x * local.x - dir.y * local.y, dir.y * local.x + dir.x * local.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
varying vec2 vP;
varying vec4 vColor;
void main() {
    vec2 q = vec2(vP.x, abs(vP.y));
    float d = abs(q.x + q.y * 0.9 - 0.3) - 0.14;
    float body = (1.0 - smoothstep(-0.04, 0.04, d)) * step(q.y, 0.75);
    gl_FragColor = vec4(vColor.rgb * vColor.a * body, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

/**
 * Places a pointer for each recent off-view moment.
 * @param {import('../director/moment-log.js').MomentLog} log the moments
 * @param {{view: {left: number, right: number, top: number, bottom: number}, zoom: number, nowMs: number}} at the view
 *   in world units, the zoom and the wall time
 * @param {{pose: Float32Array, color: Float32Array}} out `MOMENT_LOG_SIZE x 4` floats each
 * @returns {number} pointers written
 */
export function packPointers(log, { view, zoom, nowMs }, out) {
    const inset = POINTER_INSET_PX / zoom;
    const cx = (view.left + view.right) / 2;
    const cy = (view.top + view.bottom) / 2;
    const hx = (view.right - view.left) / 2 - inset;
    const hy = (view.top - view.bottom) / 2 - inset;
    let n = 0;
    for (let i = 0; i < log.count; i++) {
        const age = nowMs - log.atMs[i];
        const dx = log.x[i] - cx;
        const dy = log.y[i] - cy;
        const outside = Math.abs(dx) > hx + inset || Math.abs(dy) > hy + inset;
        if (age < 0 || age >= POINTER_MS || !outside) {
            continue;
        }
        const k = Math.min(hx / Math.max(Math.abs(dx), 1e-6), hy / Math.max(Math.abs(dy), 1e-6));
        const o = n * VEC4;
        out.pose[o] = cx + dx * k;
        out.pose[o + 1] = cy + dy * k;
        out.pose[o + 2] = Math.atan2(dy, dx);
        out.pose[o + 3] = POINTER_PX / zoom;
        const rgb = KILLS.has(log.kind[i]) ? PALETTE.eatenFlash : PALETTE.coolWhite;
        out.color[o] = rgb[0];
        out.color[o + 1] = rgb[1];
        out.color[o + 2] = rgb[2];
        out.color[o + 3] = 1.2 * (1 - age / POINTER_MS);
        n += 1;
    }
    return n;
}

const VIEW = { left: 0, right: 0, top: 0, bottom: 0 };
const AT = { view: VIEW, zoom: 1, nowMs: 0 };

/**
 * @param {{moments: import('../director/moment-log.js').MomentLog}} options the live moment log
 * @returns {import('./scene.js').Layer} the pointers, under the combat look item
 */
export function createFxPointersLayer({ moments }) {
    const geometry = createQuadGeometry(MOMENT_LOG_SIZE, ['iPose', 'iColor']);
    const material = new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geometry, material, MOMENT_LOG_SIZE);
    const out = { pose: new Float32Array(MOMENT_LOG_SIZE * VEC4), color: new Float32Array(MOMENT_LOG_SIZE * VEC4) };
    let on = true;
    return {
        object: mesh,
        setLook(look) {
            on = look.combat !== undefined && look.combat !== LOOK_OFF;
        },
        update(frame) {
            viewBounds(frame.camera, VIEW);
            AT.zoom = frame.camera.zoom;
            AT.nowMs = frame.nowMs;
            uploadInstances(mesh, { iPose: out.pose, iColor: out.color }, on ? packPointers(moments, AT, out) : 0);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
