import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { createAuroraLayer } from '../../../js/app/renderer/aurora-layer.js';
import { smallReady } from '../helpers/ready.js';

/**
 * @param {any} info
 * @returns {any}
 */
function frameOf(info) {
    return {
        nowMs: 2500,
        dtMs: 16,
        snapshot: null,
        agents: createInterpolated(1),
        camera: createCameraController({
            canvas: { width: 1600, height: 1000 },
            world: { width: info.worldWidth, height: info.worldHeight },
        }),
        lenses: { temperature: false, scent: false, territory: false, vision: false, calls: false },
        season: 1,
        seasonProgress: 0.5,
    };
}

describe('aurora-layer', () => {
    it('creates an upsample quad with proper initial visibility', () => {
        const layer = createAuroraLayer();
        expect(layer.object.visible).toBe(false);
        expect(layer.object.material.uniforms.uRibbons.value).toBeDefined();
        layer.dispose();
    });

    it('handles quality tiers via setLook', () => {
        const layer = createAuroraLayer();

        layer.setLook?.({ aurora: 0 });
        expect(layer.object.visible).toBe(true);

        layer.setLook?.({ aurora: 1 });
        expect(layer.object.visible).toBe(true);

        layer.setLook?.({ aurora: -1 });
        expect(layer.object.visible).toBe(false);

        layer.dispose();
    });

    it('updates uniforms on each frame', () => {
        const { info } = smallReady();
        const layer = createAuroraLayer();
        const frame = frameOf(info);

        layer.update?.(frame);
        expect(layer.object.material.uniforms.uFrame.value).toBe(1);
        expect(layer.object.material.uniforms.uGain.value).toBeGreaterThan(0.5);

        layer.dispose();
    });

    it('prerender handles fake renderer without error', () => {
        const layer = createAuroraLayer();
        let targetSet = null;
        let renderedScene = null;
        const fakeRenderer = /** @type {any} */ ({
            getRenderTarget: () => null,
            setRenderTarget: (/** @type {any} */ t) => {
                targetSet = t;
            },
            render: (/** @type {any} */ s) => {
                renderedScene = s;
            },
        });

        layer.prerender?.(fakeRenderer, null);
        expect(targetSet).toBeDefined();
        expect(renderedScene).toBeDefined();
        layer.dispose();
    });
});
