import { describe, expect, it } from 'vitest';
import {
    createFloraGlow,
    disposeFloraGlow,
    packFloraGlows,
    setFloraVisibility,
} from '../../../js/app/renderer/flora-glow.js';
import { SCENERY_MAX_LUMINANCE } from '../../../js/app/renderer/colors.js';
import { luminance } from './helpers/color-metrics.js';

describe('live patch glows', () => {
    it('copies each live record with its hue and fruiting weight into bounded reusable buffers', () => {
        const records = Float32Array.from([100, 200, 3, -1, 0.25, 300, 400, 1, 1, 0.75]);
        const out = { pose: new Float32Array(8), tint: new Float32Array(8), radius: 100, rgb: [0, 0, 0] };
        expect(packFloraGlows(records, { patchStart: 0, patchCount: 2 }, out)).toBe(2);
        expect(Array.from(out.pose)).toEqual([100, 200, 160, 0, 300, 400, 160, 0]);
        expect(out.tint[3]).toBe(0.25);
        expect(out.tint[7]).toBe(0.75);
        expect(luminance(out.tint.subarray(0, 3))).toBeCloseTo(SCENERY_MAX_LUMINANCE);
        expect(luminance(out.tint.subarray(4, 7))).toBeCloseTo(SCENERY_MAX_LUMINANCE);
        expect(out.tint[1]).toBeGreaterThan(out.tint[0]);
        expect(out.tint[4]).toBeGreaterThan(out.tint[5]);
    });

    it('bounds patch writes to capacity and handles an empty patch section', () => {
        const out = { pose: new Float32Array(4), tint: new Float32Array(4), radius: 10, rgb: [0, 0, 0] };
        const records = Float32Array.from([100, 200, 3, 0, 0.25, 300, 400, 1, 1, 0.75]);
        expect(packFloraGlows(records, { patchStart: 0, patchCount: 2 }, out)).toBe(1);
        expect(out.pose.slice(0, 3)).toEqual(Float32Array.from([100, 200, 16]));
        expect(packFloraGlows(records, { patchStart: 0, patchCount: 0 }, out)).toBe(0);
    });

    it('updates and hides a glow mesh from snapshot state, with config fallbacks', () => {
        const glow = createFloraGlow({ patches: [{ radius: 25 }] });
        const buffer = new ArrayBuffer(12 * 4);
        const snapshot = { u32: new Uint32Array(buffer), f32: new Float32Array(buffer) };
        snapshot.u32[6] = 1;
        snapshot.f32.set([20, 30, 0, 0, 0.5], 7);
        glow.update(snapshot);
        expect(glow.mesh.count).toBe(1);
        glow.update(null);
        expect(glow.mesh.visible).toBe(false);
        glow.geom.dispose();
        glow.mat.dispose();
        glow.mesh.dispose();
    });

    it('supports a world with no allocated patch slots', () => {
        const glow = createFloraGlow({});
        const buffer = new ArrayBuffer(7 * 4);
        glow.update({ u32: new Uint32Array(buffer), f32: new Float32Array(buffer) });
        expect(glow.mesh.count).toBe(0);
        glow.geom.dispose();
        glow.mat.dispose();
        glow.mesh.dispose();
    });

    it('sets terrain and flora visibility independently when optional layers are present', () => {
        const parts = {
            group: { visible: false },
            frost: { mesh: { visible: true } },
            refuge: { mesh: { visible: true } },
            patches: { mesh: { visible: true } },
            flora: { mesh: { visible: true } },
        };
        setFloraVisibility(parts, true, true);
        expect(parts).toMatchObject({
            group: { visible: true },
            frost: { mesh: { visible: true } },
            refuge: { mesh: { visible: true } },
            patches: { mesh: { visible: false } },
            flora: { mesh: { visible: true } },
        });
        setFloraVisibility(parts, false, false);
        expect(parts.group.visible).toBe(false);
        expect(parts.patches.mesh.visible).toBe(false);
        expect(parts.flora.mesh.visible).toBe(false);
        setFloraVisibility(
            { group: { visible: false }, frost: null, refuge: null, patches: null, flora: null },
            false,
            false,
        );
    });

    it('disposes allocated meshes and accepts an absent flora layer', () => {
        const disposed = /** @type {string[]} */ ([]);
        disposeFloraGlow({
            geom: { dispose: () => disposed.push('geometry') },
            mat: { dispose: () => disposed.push('material') },
            mesh: { dispose: () => disposed.push('mesh') },
        });
        disposeFloraGlow(null);
        expect(disposed).toEqual(['geometry', 'material', 'mesh']);
    });
});
