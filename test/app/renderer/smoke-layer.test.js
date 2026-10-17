import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createSmokeLayer, packClouds, smokeShape, TARGET_DIVISOR } from '../../../js/app/renderer/smoke-layer.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('smokeShape', () => {
    it('is a half-size, full-alpha puff when new', () => {
        const s = smokeShape(1);
        expect(s.radiusScale).toBe(0.5);
        expect(s.alpha).toBe(0.55);
    });

    it('is full size by a quarter of its age and still at full alpha', () => {
        const s = smokeShape(0.75);
        expect(s.radiusScale).toBe(1);
        expect(s.alpha).toBe(0.55);
    });

    it('fades from 55% of its age and is gone at the end', () => {
        expect(smokeShape(0.25).alpha).toBeLessThan(0.55);
        expect(smokeShape(0.25).alpha).toBeGreaterThan(0.1);
        expect(smokeShape(0.5).alpha).toBe(0.55);
        expect(smokeShape(0)).toEqual({ radiusScale: 1, alpha: 0 });
    });

    it('writes into the given object', () => {
        const out = { radiusScale: 0, alpha: 0 };
        expect(smokeShape(0.9, out)).toBe(out);
        expect(out.radiusScale).toBeGreaterThan(0.5);
    });
});

describe('packClouds', () => {
    it('writes x, y, scaled radius and alpha for each cloud, capped at capacity', () => {
        const snap = makeSnapshot(1, [], {
            clouds: [
                [100, 200, 1],
                [300, 400, 0.5],
                [5, 5, 0.1],
            ],
        });
        const out = new Float32Array(2 * 4);
        const n = packClouds(snap.f32, { start: 6, count: 3 }, { smokeRadius: 80, out });
        expect(n).toBe(2);
        expect(Array.from(out.slice(0, 4))).toEqual([100, 200, 40, Math.fround(0.55)]);
        expect(out[6]).toBeGreaterThan(40);
    });
});

describe('createSmokeLayer', () => {
    it('draws the clouds twice from one geometry and exposes the alpha target', () => {
        const { info } = smallReady();
        const layer = createSmokeLayer({ info });
        const snap = makeSnapshot(1, [], { clouds: [[100, 200, 1]] });
        const camera = createCameraController({
            canvas: { width: 400, height: 400 },
            world: { width: 400, height: 400 },
        });
        layer.update?.(/** @type {any} */ ({ nowMs: 2000, snapshot: snap, camera }));
        expect(layer.object.count).toBe(1);
        expect(layer.object.material.uniforms.uSmoke.value).toEqual(PALETTE.smoke);
        expect(layer.object.material.defines.ALPHA_ONLY).toBeUndefined();
        layer.resize?.(1000, 500);
        expect(layer.texture.image.width).toBe(1000 / TARGET_DIVISOR);
        expect(layer.texture.image.height).toBe(500 / TARGET_DIVISOR);
        layer.dispose();
    });

    it('renders its alpha target only while there is smoke or a stale image to clear', () => {
        const { info } = smallReady();
        const layer = createSmokeLayer({ info });
        /** @type {string[]} */
        const calls = [];
        const renderer = {
            setRenderTarget: () => calls.push('target'),
            clear: () => calls.push('clear'),
            render: () => calls.push('render'),
        };
        layer.prerender?.(renderer, {});
        expect(calls).toEqual(['target', 'clear', 'render', 'target']);
        calls.length = 0;
        layer.prerender?.(renderer, {});
        expect(calls).toEqual([]);
    });
});
