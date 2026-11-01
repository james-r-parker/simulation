import { describe, expect, it } from 'vitest';
import { FLORA_MAX_LUMINANCE, floraColor } from '../../../js/app/renderer/flora-colors.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { FOOD_FRAGMENT } from '../../../js/app/renderer/world-layers-shader.js';
import { FOOD_INTENSITY } from '../../../js/app/renderer/world-layers.js';
import { colorDistance, luminance } from './helpers/color-metrics.js';

describe('flora hue ramp', () => {
    it('follows green, yellow, red and magenta without wrapping the plant coordinate', () => {
        const out = [0, 0, 0];
        expect(floraColor(-1, out)).toBe(out);
        expect(out[1]).toBeGreaterThan(out[0]);
        floraColor(-1 / 3, out);
        expect(out[0]).toBeCloseTo(out[1]);
        floraColor(1 / 3, out);
        expect(out[0]).toBeGreaterThan(out[1]);
        floraColor(1, out);
        expect(out[0]).toBeCloseTo(out[2]);
        expect(colorDistance(floraColor(-1, [0, 0, 0]), out)).toBeGreaterThan(15);
    });

    it('matches the shader hue and luminance math at representative coordinates', () => {
        expect(FOOD_FRAGMENT).toContain('120.0 - 90.0 * (clamp(hue, -1.0, 1.0) + 1.0)');
        expect(FOOD_FRAGMENT).toContain('0.2126729, 0.7151522, 0.072175');
        for (const hue of [-1, -1 / 3, 0, 1 / 3, 2 / 3, 1]) {
            const h = ((120 - 90 * (hue + 1) + 360) % 360) / 60;
            const x = 1 - Math.abs((h % 2) - 1);
            const rgb = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : [1, 0, x];
            const scale = Math.min(1, FLORA_MAX_LUMINANCE / luminance(rgb));
            const actual = floraColor(hue, [0, 0, 0]);
            for (let i = 0; i < 3; i++) {
                expect(actual[i]).toBeCloseTo(rgb[i] * scale, 6);
            }
        }
    });

    it('never exceeds the existing food luminance and clamps out-of-range hues', () => {
        expect(FLORA_MAX_LUMINANCE).toBeCloseTo(luminance(PALETTE.food) * FOOD_INTENSITY);
        for (let h = -1; h <= 1; h += 0.01) {
            expect(luminance(floraColor(h, [0, 0, 0]))).toBeLessThanOrEqual(FLORA_MAX_LUMINANCE + 1e-7);
        }
        expect(floraColor(-2, [0, 0, 0])).toEqual(floraColor(-1, [0, 0, 0]));
        expect(floraColor(2, [0, 0, 0])).toEqual(floraColor(1, [0, 0, 0]));
    });
});
