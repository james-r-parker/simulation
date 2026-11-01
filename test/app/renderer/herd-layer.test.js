import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createHerdLayer, packHerdBodies } from '../../../js/app/renderer/herd-layer.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('packHerdBodies', () => {
    it('packs the visible disc fields and caps at the output capacity', () => {
        const f32 = Float32Array.from([10, 20, 80, 0.3, -1, 30, 40, 90, 0.8, 2]);
        const out = new Float32Array(4);
        expect(packHerdBodies(f32, { herdStart: 0, herdCount: 2 }, out)).toBe(1);
        expect(Array.from(out.slice(0, 3))).toEqual([10, 20, 80]);
        expect(out[3]).toBeCloseTo(0.3);
    });
});

describe('createHerdLayer', () => {
    it('draws only snapshot herds as discs, tracks zoom and clears when the snapshot is absent', () => {
        const snapshot = makeSnapshot(3, [], { herds: [[100, 200, 80, 0.5, 1.2]] });
        const layer = createHerdLayer({ info: { herdMax: 4 } });
        const camera = createCameraController({
            canvas: { width: 400, height: 400 },
            world: { width: 400, height: 400 },
        });
        camera.zoom = 3;
        layer.update?.(/** @type {any} */ ({ snapshot, camera }));
        expect(layer.object.count).toBe(1);
        expect(layer.object.visible).toBe(true);
        expect(Array.from(layer.object.geometry.getAttribute('iBody').array.slice(0, 4))).toEqual([100, 200, 80, 0.5]);
        expect(layer.object.material.uniforms.uZoom.value).toBe(3);
        camera.zoom = 1;
        layer.update?.(/** @type {any} */ ({ snapshot: null, camera }));
        expect(layer.object.count).toBe(0);
        layer.dispose();
    });
});
