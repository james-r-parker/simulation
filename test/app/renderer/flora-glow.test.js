import { describe, expect, it } from 'vitest';
import { packFloraGlows } from '../../../js/app/renderer/flora-glow.js';
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
});
