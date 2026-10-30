import { describe, expect, it } from 'vitest';
import { CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three';
import { createFinishLayer, FINISH, vignetteAt } from '../../../js/app/renderer/finish-layer.js';
import { LOOK_OFF } from '../../../js/app/renderer/quality.js';

describe('FINISH constants', () => {
    it('matches the designed vignette and grain parameters', () => {
        expect(FINISH.vignette).toBeCloseTo(0.18);
        expect(FINISH.grain).toBeCloseTo(1.5 / 255);
    });
});

describe('vignetteAt', () => {
    it('is 0 at the centre, at most 0.18 anywhere, and non-decreasing outwards', () => {
        expect(vignetteAt(0)).toBe(0);

        let prev = 0;
        for (let r = 0; r <= 2.0; r += 0.05) {
            const v = vignetteAt(r);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(FINISH.vignette + 1e-6);
            expect(v).toBeGreaterThanOrEqual(prev - 1e-6);
            prev = v;
        }

        expect(vignetteAt(1.0)).toBeCloseTo(FINISH.vignette);
    });
});

describe('createFinishLayer', () => {
    it('sets up a full-canvas quad with premultiplied alpha blending', () => {
        const layer = createFinishLayer();
        const mesh = layer.object;
        expect(mesh).toBeDefined();
        expect(mesh.frustumCulled).toBe(false);

        const mat = mesh.material;
        expect(mat.blending).toBe(CustomBlending);
        expect(mat.blendSrc).toBe(OneFactor);
        expect(mat.blendDst).toBe(OneMinusSrcAlphaFactor);
        expect(mat.premultipliedAlpha).toBe(true);
        expect(mat.transparent).toBe(true);

        layer.dispose();
    });

    it('toggles visibility and grain across tiers via setLook', () => {
        const layer = createFinishLayer();
        const mat = layer.object.material;

        layer.setLook?.({ finish: 0 });
        expect(layer.object.visible).toBe(true);
        expect(mat.uniforms.uVignette.value).toBe(FINISH.vignette);
        expect(mat.uniforms.uGrain.value).toBe(FINISH.grain);

        layer.setLook?.({ finish: 1 });
        expect(layer.object.visible).toBe(true);
        expect(mat.uniforms.uVignette.value).toBe(FINISH.vignette);
        expect(mat.uniforms.uGrain.value).toBe(0);

        layer.setLook?.({ finish: LOOK_OFF });
        expect(layer.object.visible).toBe(false);

        layer.dispose();
    });

    it('advances frame counter on update and updates resolution on resize', () => {
        const layer = createFinishLayer();
        const mat = layer.object.material;

        expect(mat.uniforms.uFrame.value).toBe(0);
        layer.update?.(/** @type {any} */ ({}));
        expect(mat.uniforms.uFrame.value).toBe(1);
        layer.update?.(/** @type {any} */ ({}));
        expect(mat.uniforms.uFrame.value).toBe(2);

        layer.resize?.(1920, 1080);
        expect(mat.uniforms.uResolution.value.x).toBe(1920);
        expect(mat.uniforms.uResolution.value.y).toBe(1080);

        layer.dispose();
    });
});
