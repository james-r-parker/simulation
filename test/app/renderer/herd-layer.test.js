import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { herdColor } from '../../../js/app/renderer/herd-colors.js';
import { createHerdLayer, packHerdBodies } from '../../../js/app/renderer/herd-layer.js';
import { createSections, readSections } from '../../../js/app/snapshot-view.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('packHerdBodies', () => {
    it('packs heading, speed and group colour, capped at capacity', () => {
        const snapshot = makeSnapshot(1, [], {
            herds: [
                [10, 20, 0, 0.3, -1, 2],
                [30, 40, 1, 0.8, 2, 3],
            ],
        });
        const section = readSections(snapshot.u32, createSections());
        const body = new Float32Array(4);
        const motion = new Float32Array(4);
        const colors = new Float32Array(4);
        expect(packHerdBodies(snapshot.f32, snapshot.u32, section, { body, motion, colors, radius: 80 })).toBe(1);
        expect(Array.from(body.slice(0, 3))).toEqual([10, 20, 80]);
        expect(body[3]).toBeCloseTo(0.3);
        expect(motion[0]).toBe(-1);
        expect(motion[1]).toBeCloseTo(2 * 7 * 2.399963229728653);
        colors.slice(0, 3).forEach((value, index) => expect(value).toBeCloseTo(herdColor(2)[index]));
    });
});

describe('createHerdLayer', () => {
    it('draws shaped snapshot herds, tracks time and zoom, and clears on a missing snapshot', () => {
        const snapshot = makeSnapshot(3, [], { herds: [[100, 200, 0, 0.5, 1.2, 0]] });
        const layer = createHerdLayer({ info: { herdMax: 4, herdRadius: 80 } });
        const camera = createCameraController({
            canvas: { width: 400, height: 400 },
            world: { width: 400, height: 400 },
        });
        camera.zoom = 3;
        layer.update?.(/** @type {any} */ ({ snapshot, camera, nowMs: 2500 }));
        expect(layer.object.count).toBe(1);
        expect(layer.object.visible).toBe(true);
        expect(Array.from(layer.object.geometry.getAttribute('iBody').array.slice(0, 3))).toEqual([100, 200, 80]);
        expect(layer.object.geometry.getAttribute('iBody').array[3]).toBeCloseTo(0.5);
        expect(layer.object.geometry.getAttribute('iMotion').array[0]).toBeCloseTo(1.2);
        expect(layer.object.geometry.getAttribute('iMotion').array[1]).toBe(0);
        const packedColor = /** @type {Float32Array} */ (layer.object.geometry.getAttribute('iColor').array);
        packedColor.slice(0, 3).forEach((value, index) => expect(value).toBeCloseTo(herdColor(0)[index]));
        expect(layer.object.material.uniforms.uZoom.value).toBe(3);
        expect(layer.object.material.uniforms.uMinPx.value).toBe(8);
        expect(layer.object.material.uniforms.uTime.value).toBe(2.5);
        layer.setLook?.({ herds: 1 });
        expect(layer.object.material.uniforms.uDetail.value).toBe(1);
        layer.setLook?.({ herds: -1 });
        layer.update?.(/** @type {any} */ ({ snapshot, camera, nowMs: 2500 }));
        expect(layer.object.visible).toBe(true);
        expect(layer.object.material.uniforms.uDetail.value).toBe(2);
        layer.setLook?.({});
        expect(layer.object.material.uniforms.uDetail.value).toBe(0);
        layer.setLook?.({ herds: 0 });
        layer.update?.(/** @type {any} */ ({ snapshot, camera, nowMs: 2500 }));
        expect(layer.object.visible).toBe(true);
        expect(layer.object.material.uniforms.uDetail.value).toBe(0);
        layer.update?.(/** @type {any} */ ({ snapshot: null, camera }));
        expect(layer.object.count).toBe(0);
        layer.dispose();
    });
});
