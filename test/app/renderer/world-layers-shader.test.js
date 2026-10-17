import { describe, expect, it } from 'vitest';
import * as shaders from '../../../js/app/renderer/world-layers-shader.js';

describe('world layer shaders', () => {
    it('share the instanced vertex shader and avoid reserved words', () => {
        expect(shaders.FOOD_VERTEX).toBe(shaders.OBSTACLE_VERTEX);
        expect(shaders.FOOD_VERTEX).toContain('attribute vec4 iBody');
        expect(shaders.FOOD_VERTEX).not.toMatch(/float half\b/);
    });

    it('declare what the layers set', () => {
        for (const u of ['uColor', 'uIntensity', 'uTime']) {
            expect(shaders.FOOD_FRAGMENT).toContain(u);
        }
        for (const u of ['uBody', 'uRim', 'uRimPx']) {
            expect(shaders.OBSTACLE_FRAGMENT).toContain(u);
        }
        for (const u of ['uZoom', 'uPad', 'uMinPx']) {
            expect(shaders.FOOD_VERTEX).toContain(u);
        }
    });

    it('draws food as a four-point sparkle 1.6 radii across, not a disc', () => {
        expect(shaders.FOOD_FRAGMENT).toContain('sqrt(p.x) + sqrt(p.y)');
        expect(shaders.FOOD_FRAGMENT).toContain('/ 0.8');
    });
});
