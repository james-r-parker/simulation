import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { SCENERY_MAX_LUMINANCE } from '../../../js/app/renderer/colors.js';
import { createDungLayer, packDungMarks } from '../../../js/app/renderer/dung-layer.js';
import { makeSnapshot } from '../helpers/snapshots.js';
import { luminance } from './helpers/color-metrics.js';

describe('packDungMarks', () => {
    it('keeps dung-origin zones, fades with fertility and stays below half the scenery ceiling', () => {
        const snapshot = makeSnapshot(1, [], {
            zones: [
                [10, 20, 0.75, 1],
                [30, 40, 0.5, 0],
            ],
        });
        const out = { origin: 1, body: new Float32Array(8), tint: new Float32Array(8) };
        expect(packDungMarks(snapshot.f32, snapshot.u32, { zoneStart: 10, zoneCount: 2 }, out)).toBe(1);
        expect(Array.from(out.body.slice(0, 4))).toEqual([10, 20, 46, 0.75]);
        expect(luminance(out.tint.slice(0, 3))).toBeCloseTo(0.5 * SCENERY_MAX_LUMINANCE);
    });

    it('bounds writes by capacity and clamps fertility', () => {
        const snapshot = makeSnapshot(1, [], {
            zones: [
                [10, 20, 1.5, 1],
                [30, 40, 0.5, 1],
            ],
        });
        const out = { origin: 1, body: new Float32Array(4), tint: new Float32Array(4) };
        expect(packDungMarks(snapshot.f32, snapshot.u32, { zoneStart: 10, zoneCount: 2 }, out)).toBe(1);
        expect(out.body[3]).toBe(1);
    });
});

describe('createDungLayer', () => {
    it('reads zone records and hides when no snapshot is available', () => {
        const snapshot = makeSnapshot(3, [], { zones: [[100, 200, 0.5, 1]] });
        const layer = createDungLayer({ info: { fertileZoneMax: 4 }, layout: { zoneOrigins: { DUNG: 1 } } });
        const camera = createCameraController({
            canvas: { width: 400, height: 400 },
            world: { width: 400, height: 400 },
        });
        layer.update?.(/** @type {any} */ ({ snapshot, camera }));
        expect(layer.object.count).toBe(1);
        expect(Array.from(layer.object.geometry.getAttribute('iBody').array.slice(0, 3))).toEqual([100, 200, 46]);
        layer.setLook?.({ herds: 1 });
        expect(layer.object.material.uniforms.uDetail.value).toBe(1);
        layer.setLook?.({ herds: -1 });
        expect(layer.object.visible).toBe(false);
        layer.setLook?.({ herds: 0 });
        expect(layer.object.visible).toBe(true);
        layer.update?.(/** @type {any} */ ({ snapshot: null, camera }));
        expect(layer.object.count).toBe(0);
        layer.dispose();
    });
});
