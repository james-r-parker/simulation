// Off-view pointers: a notable moment (the live moment log) that happened outside the view in the last
// `POINTER_MS` shows a chevron at the edge of the view, pointing at it and fading, so a viewer driving the camera sees
// where something just happened. At most `MOMENT_LOG_SIZE` chevrons, packed into preallocated arrays.

import { AdditiveBlending } from 'three/webgpu';
import { viewBounds } from '../camera.js';
import { MOMENT_LOG_SIZE } from '../director/moment-log.js';
import { PALETTE } from './colors.js';
import { createModelMeshes } from './model-meshes.js';
import { MODELS } from './models.js';
import { FILL_SHARE, toDisplay } from './palette.js';

const VEC4 = 4;

/** How long a pointer shows, ms. */
export const POINTER_MS = 3000;
/** How far inside the view edge a pointer sits, and its size, in device px. */
export const POINTER_INSET_PX = 36;
export const POINTER_PX = 18;
const KILLS = new Set(['kill', 'pack-kill', 'trample']);

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
 * @param {{moments: import('../director/moment-log.js').MomentLog}} context the notable moments played
 * @returns {import('./stage.js').Layer} arrows at the screen edge pointing at recent moments off screen
 */
export function createFxPointersLayer({ moments }) {
    const out = { pose: new Float32Array(MOMENT_LOG_SIZE * VEC4), color: new Float32Array(MOMENT_LOG_SIZE * VEC4) };
    const bucket = { pose: out.pose, neon: new Float32Array(MOMENT_LOG_SIZE * VEC4), count: 0 };
    const meshes = createModelMeshes([MODELS.SHARD], { buckets: [bucket], blending: AdditiveBlending });
    const rgb = [0, 0, 0];
    return {
        object: meshes.object,
        update(frame) {
            viewBounds(frame.camera, VIEW);
            AT.zoom = frame.camera.zoom;
            AT.nowMs = frame.nowMs;
            bucket.count = packPointers(moments, AT, out);
            for (let i = 0; i < bucket.count; i++) {
                const o = i * VEC4;
                rgb[0] = out.color[o];
                rgb[1] = out.color[o + 1];
                rgb[2] = out.color[o + 2];
                toDisplay(rgb, rgb);
                const a = Math.min(out.color[o + 3], 1);
                bucket.neon[o] = rgb[0] * a;
                bucket.neon[o + 1] = rgb[1] * a;
                bucket.neon[o + 2] = rgb[2] * a;
                bucket.neon[o + 3] = FILL_SHARE.default;
            }
            meshes.upload();
        },
        dispose: () => meshes.dispose(),
    };
}
