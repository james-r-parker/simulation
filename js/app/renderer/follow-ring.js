// The ring round the followed body: one instanced quad whose fragment shader draws the ring as a signed distance, anti-
// aliased over one device pixel at any zoom, in place of the 32-sided polygon of line segments it was
// (docs/designs/ambient-display.md, "Follow as a story"). Additive like the other lines.

import {
    abs,
    attribute,
    cameraProjectionMatrix,
    float,
    length,
    positionGeometry,
    screenSize,
    varying,
} from 'three/tsl';
import { createInstances, instancedMesh, uploadInstances } from './instances.js';
import { strokeMaterial } from './line-draw.js';
import { toDisplay } from './palette.js';
import { findAgent } from './overlays.js';

/** The ring's stroke width, device px. */
export const RING_PX = 2;
/** The ring's radius as a multiple of the body's size, and its alpha. */
export const RING_SCALE = 2.2;
export const RING_ALPHA = 0.8;
/** The pixels added to the radius so a small body at a low zoom still gets a ring clear of it. */
export const RING_GAP_PX = 6;
const RING_COLOR = [0.9, 0.97, 1.0];
const RGB = [0, 0, 0];

/** @param {number} widthPx the stroke width @returns {any} the ring material: a signed-distance ring */
function ringMaterial(widthPx) {
    const ring = attribute('iRing', 'vec4');
    const color = attribute('iColor', 'vec4');
    const pxWorld = float(2).div(cameraProjectionMatrix.element(0).x.mul(screenSize.x));
    const half = ring.z.add(float(widthPx / 2 + 1).mul(pxWorld));
    const world = ring.xy.add(positionGeometry.xy.mul(half));
    const dPx = abs(length(varying(world).sub(ring.xy)).sub(ring.z)).div(pxWorld);
    const material = strokeMaterial(world, { dPx, widthPx });
    material.colorNode = color.xyz.mul(material.userData.cover);
    return material;
}

/**
 * Writes the ring's instance row: centre and radius, and the display colour scaled by the alpha.
 * @param {Record<string, Float32Array>} arrays the instance lanes
 * @param {{x: number, y: number, size: number, zoom: number}} body the followed body and the view's zoom
 * @returns {void}
 */
export function writeRing(arrays, body) {
    arrays.iRing[0] = body.x;
    arrays.iRing[1] = body.y;
    arrays.iRing[2] = body.size * RING_SCALE + RING_GAP_PX / body.zoom;
    arrays.iRing[3] = RING_ALPHA;
    const rgb = toDisplay(RING_COLOR, RGB);
    arrays.iColor[0] = rgb[0] * RING_ALPHA;
    arrays.iColor[1] = rgb[1] * RING_ALPHA;
    arrays.iColor[2] = rgb[2] * RING_ALPHA;
    arrays.iColor[3] = RING_ALPHA;
}

const BODY = { x: 0, y: 0, size: 0, zoom: 1 };

/** @returns {import('./stage.js').Layer} the ring layer, hidden while nothing is followed or the subject is gone */
export function createFollowRing() {
    const instances = createInstances(1, ['iRing', 'iColor']);
    const material = ringMaterial(RING_PX);
    const object = instancedMesh(instances, material);
    return {
        object,
        update(frame) {
            const i = findAgent(frame.agents, frame.followId);
            if (i >= 0) {
                BODY.x = frame.agents.x[i];
                BODY.y = frame.agents.y[i];
                BODY.size = frame.agents.size[i];
                BODY.zoom = frame.camera.zoom;
                writeRing(instances.arrays, BODY);
            }
            uploadInstances(instances, i >= 0 ? 1 : 0);
        },
        dispose() {
            instances.geometry.dispose();
            material.dispose();
        },
    };
}
