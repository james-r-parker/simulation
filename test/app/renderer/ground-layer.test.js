import { describe, expect, it } from 'vitest';
import { AURORA_MAX_LUMINANCE, SCENERY_MAX_LUMINANCE } from '../../../js/app/renderer/colors.js';
import { createGroundLayer, DROUGHT_FADE_MS, easeDrought, GROUND_PEAK } from '../../../js/app/renderer/ground-layer.js';
import { makeSnapshot } from '../helpers/snapshots.js';
import { smallReady } from '../helpers/ready.js';

/**
 * @param {number} season the season
 * @returns {any} a frame with only what the layer reads
 */
const frameOf = (season) => ({ season, seasonProgress: 0.3 });

describe('createGroundLayer', () => {
    it('covers the world with one quad and stays under the aurora ceiling at every season', () => {
        const { info } = smallReady();
        const layer = createGroundLayer({ info });
        const { uniforms } = layer.object.material;
        expect(layer.object.frustumCulled).toBe(false);
        for (let season = 0; season < 4; season++) {
            layer.update?.(frameOf(season));
            const t = uniforms.uTint.value;
            const y = 0.2126729 * t[0] + 0.7151522 * t[1] + 0.072175 * t[2];
            expect(y * uniforms.uPeak.value).toBeLessThanOrEqual(AURORA_MAX_LUMINANCE + 1e-9);
        }
        expect(GROUND_PEAK * AURORA_MAX_LUMINANCE).toBeLessThan(SCENERY_MAX_LUMINANCE);
        layer.dispose();
    });

    it('follows the terrain look item: full, without contours, and off', () => {
        const { info } = smallReady();
        const layer = createGroundLayer({ info });
        layer.setLook?.({ terrain: 0 });
        expect(layer.object.visible).toBe(true);
        expect(layer.object.material.uniforms.uDetail.value).toBe(1);
        layer.setLook?.({ terrain: 1 });
        expect(layer.object.visible).toBe(true);
        expect(layer.object.material.uniforms.uDetail.value).toBe(0);
        layer.setLook?.({ terrain: 2 });
        expect(layer.object.visible).toBe(false);
        layer.setLook?.({ terrain: -1 });
        expect(layer.object.visible).toBe(false);
        layer.dispose();
    });

    it('changes tint with the season', () => {
        const { info } = smallReady();
        const layer = createGroundLayer({ info });
        layer.update?.(frameOf(0));
        const spring = [...layer.object.material.uniforms.uTint.value];
        layer.update?.(frameOf(3));
        expect([...layer.object.material.uniforms.uTint.value]).not.toEqual(spring);
        layer.dispose();
    });
});

describe('the drought tint', () => {
    it('fades the basin under drought in and the other out over DROUGHT_FADE_MS', () => {
        const shares = new Float32Array([0, 1]);
        easeDrought(shares, 0, DROUGHT_FADE_MS / 2);
        expect(Array.from(shares)).toEqual([0.5, 0.5]);
        easeDrought(shares, 0, DROUGHT_FADE_MS);
        expect(Array.from(shares)).toEqual([1, 0]);
        easeDrought(shares, -1, DROUGHT_FADE_MS);
        expect(Array.from(shares)).toEqual([0, 0]);
    });

    it('reads the basin from the snapshot header, only while the weather item draws', () => {
        const { info } = smallReady();
        const layer = createGroundLayer({ info });
        const snapshot = makeSnapshot(1, []);
        snapshot.u32[9] = 2;
        const frame = /** @type {any} */ ({ season: 0, seasonProgress: 0, snapshot, dtMs: DROUGHT_FADE_MS });
        layer.setLook?.({ terrain: 0, weather: 0 });
        layer.update?.(frame);
        const d = layer.object.material.uniforms.uDrought.value;
        expect(Array.from(d)).toEqual([0, 1]);
        layer.setLook?.({ terrain: 0, weather: -1 });
        layer.update?.(frame);
        expect(Array.from(d)).toEqual([0, 0]);
        layer.dispose();
    });
});
