import { describe, expect, it } from 'vitest';
import { WEATHER_FRAGMENT, WEATHER_MODE, WEATHER_VERTEX } from '../../../js/app/renderer/weather-shader.js';

describe('weather shader', () => {
    it('declares the seed attribute and the uniforms the layer feeds', () => {
        for (const name of ['iSeed', 'uView', 'uTime', 'uZoom', 'uModeA', 'uModeB', 'uMix', 'uColdMargin', 'uColors']) {
            expect(WEATHER_VERTEX).toContain(name);
        }
        expect(WEATHER_FRAGMENT).toContain('colorspace_fragment');
    });

    it('has one mode per season, snow last, denser in the cold margin', () => {
        expect(Object.values(WEATHER_MODE)).toEqual([0, 1, 2, 3]);
        expect(WEATHER_VERTEX).toContain('step(iSeed.z, 0.5 + 0.5 * cold)');
    });

    it('wraps each mote into the view, so the count on screen never depends on the zoom', () => {
        expect(WEATHER_VERTEX).toContain('mod(iSeed.xy * spread + drift(mode, iSeed, uTime) - uView.xy, uView.zw)');
    });
});
