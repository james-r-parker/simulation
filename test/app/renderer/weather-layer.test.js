import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { WEATHER_MAX_LUMINANCE } from '../../../js/app/renderer/colors.js';
import { LOOK_OFF } from '../../../js/app/renderer/quality.js';
import {
    createWeatherLayer,
    SEASON_BLEND,
    seasonWeights,
    WEATHER_COUNT,
} from '../../../js/app/renderer/weather-layer.js';

const L = 1000;

describe('seasonWeights', () => {
    it('matches the sim season (floor of 4 x the year phase) away from the boundaries', () => {
        const out = { a: 0, b: 0, mix: 0 };
        for (let s = 0; s < 8; s++) {
            seasonWeights(s * L + L / 2, L, out);
            expect(out.a).toBe(s % 4);
            expect(out.mix).toBe(0);
        }
    });

    it('cross-fades to half at each boundary, from SEASON_BLEND inside each season', () => {
        const out = { a: 0, b: 0, mix: 0 };
        seasonWeights(L - 1e-6, L, out);
        expect(out).toEqual({ a: 0, b: 1, mix: expect.closeTo(0.5, 4) });
        seasonWeights(L, L, out);
        expect(out).toEqual({ a: 1, b: 0, mix: 0.5 });
        seasonWeights(L * (1 + SEASON_BLEND / 2), L, out);
        expect(out.mix).toBeCloseTo(0.25);
        seasonWeights(L * (1 - SEASON_BLEND), L, out);
        expect(out.mix).toBeCloseTo(0);
        seasonWeights(4 * L - 1, L, out);
        expect(out.b).toBe(0);
    });
});

describe('weather layer', () => {
    it('draws its mote count per level, none when the weather item is off, and feeds the season', () => {
        const info = { worldHeight: 2000, seasonLength: L, terrain: { coldMarginWidth: 200 } };
        const layer = createWeatherLayer({ info, seed: 3 });
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 400, height: 200 }),
            world: { width: 4000, height: 2000 },
        });
        const frame = /** @type {any} */ ({ tick: 3.5 * L, nowMs: 2000, camera });
        layer.setLook?.({ weather: 0 });
        layer.update?.(frame);
        expect(layer.object.count).toBe(WEATHER_COUNT[0]);
        expect(layer.uniforms.uModeA.value).toBe(3);
        expect(layer.uniforms.uColdMargin.value).toBe(200);
        layer.setLook?.({ weather: 1 });
        layer.update?.(frame);
        expect(layer.object.count).toBe(WEATHER_COUNT[1]);
        layer.setLook?.({ weather: LOOK_OFF });
        layer.update?.(frame);
        expect(layer.object.visible).toBe(false);
        layer.dispose();
    });

    it('scales every mode colour to the weather luminance ceiling', () => {
        const layer = createWeatherLayer({ info: { worldHeight: 1, seasonLength: 1 }, seed: 1 });
        for (const c of layer.uniforms.uColors.value) {
            expect(0.2126729 * c.x + 0.7151522 * c.y + 0.072175 * c.z).toBeCloseTo(WEATHER_MAX_LUMINANCE, 6);
        }
        layer.dispose();
    });
});
