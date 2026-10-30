import { describe, expect, it } from 'vitest';
import * as shaders from '../../../js/app/renderer/world-layers-shader.js';

describe('world layer shaders', () => {
    it('sets up obstacle vertex shader with instanced shape attribute and world position', () => {
        expect(shaders.OBSTACLE_VERTEX).toContain('attribute vec4 iBody');
        expect(shaders.OBSTACLE_VERTEX).toContain('attribute vec4 iShape');
        expect(shaders.OBSTACLE_VERTEX).toContain('varying vec4 vShape');
        expect(shaders.OBSTACLE_VERTEX).toContain('varying vec2 vWorld');
        expect(shaders.OBSTACLE_VERTEX).not.toMatch(/float half\b/);
    });

    it('declares two-pass obstacle uniforms and controls', () => {
        for (const u of ['uBody', 'uRim', 'uContact', 'uLichen', 'uSceneryMax', 'uRimPx', 'uTime', 'uTier', 'uPass']) {
            expect(shaders.OBSTACLE_FRAGMENT).toContain(u);
        }
    });

    it('declares food uniforms', () => {
        for (const u of ['uColor', 'uIntensity', 'uTime']) {
            expect(shaders.FOOD_FRAGMENT).toContain(u);
        }
        for (const u of ['uZoom', 'uPad', 'uMinPx']) {
            expect(shaders.FOOD_VERTEX).toContain(u);
        }
    });

    it('draws food as a four-point sparkle 1.6 radii across, not a disc', () => {
        expect(shaders.FOOD_FRAGMENT).toContain('sqrt(p.x) + sqrt(p.y)');
        expect(shaders.FOOD_FRAGMENT).toContain('/ 0.8');
    });

    it('sizes by the absolute radius and reads a negative radius as meat', () => {
        expect(shaders.FOOD_VERTEX).toContain('abs(iBody.z)');
        expect(shaders.FOOD_VERTEX).toContain('iBody.z < 0.0');
        expect(shaders.FOOD_FRAGMENT).toContain('uMeatColor');
        expect(shaders.FOOD_FRAGMENT).toContain('mix(uColor, uMeatColor, vMeat)');
    });

    it('shades the rock body from world position only, so touching rocks leave no arc inside the ridge', () => {
        expect(shaders.OBSTACLE_FRAGMENT).toContain('fbm2(vWorld');
        expect(shaders.OBSTACLE_FRAGMENT).not.toMatch(/radialLit|d \/ max\(bodyRadius[^;]*\) *\*/);
        expect(shaders.OBSTACLE_FRAGMENT).not.toContain('radialLit');
    });
});
