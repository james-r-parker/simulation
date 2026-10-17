import { describe, expect, it } from 'vitest';
import {
    familyName,
    lineageColor,
    lineageHue,
    PALETTE,
    temperatureBands,
    temperatureColor,
    temperatureRamp,
} from '../../../js/app/renderer/colors.js';

const bands = { cold: 0.3, optimalMin: 0.4, optimalMax: 0.65, heat: 0.85 };

describe('PALETTE', () => {
    it('holds linear triples, the background is black, and the doc colours are exact', () => {
        for (const rgb of Object.values(PALETTE)) {
            expect(rgb).toHaveLength(3);
            expect(rgb.every((v) => v >= 0 && v <= 1)).toBe(true);
        }
        expect(PALETTE.background).toEqual([0, 0, 0]);
        expect(PALETTE.food).toEqual([0.35, 0.9, 0.7]);
        expect(PALETTE.huntScent).toEqual([1.0, 0.62, 0.12]);
        expect(PALETTE.dangerScent).toEqual([0.9, 0.12, 0.25]);
        expect(PALETTE.attackScent).toEqual([0.55, 0.32, 1.0]);
        expect(PALETTE.smoke).toEqual([0.03, 0.04, 0.06]);
        expect(PALETTE.obstacleBody).toEqual([0.012, 0.016, 0.024]);
        expect(PALETTE.obstacleRim).toEqual([0.09, 0.12, 0.18]);
    });
});

describe('lineageColor', () => {
    it('spreads hue by the golden ratio', () => {
        expect(lineageHue(0)).toBe(0);
        expect(lineageHue(1)).toBeCloseTo(0.618034, 6);
        expect(lineageHue(2)).toBeCloseTo(0.236068, 6);
    });

    it('is saturated (spread between channels) and within 0..1 for many lineages', () => {
        for (let id = 0; id < 200; id++) {
            const rgb = lineageColor(id, 0.5);
            expect(Math.min(...rgb)).toBeGreaterThanOrEqual(0);
            expect(Math.max(...rgb)).toBeLessThanOrEqual(1);
            expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(0.05);
        }
    });

    it('brightens with energy and clamps outside 0..1', () => {
        const lum = (/** @type {ArrayLike<number>} */ c) => c[0] + c[1] + c[2];
        expect(lum(lineageColor(3, 1))).toBeGreaterThan(lum(lineageColor(3, 0)));
        expect(lineageColor(3, 5)).toEqual(lineageColor(3, 1));
        expect(lineageColor(3, -2)).toEqual(lineageColor(3, 0));
    });

    it('is a pure function of the id and writes into the given array', () => {
        const out = new Float32Array(3);
        expect(lineageColor(9, 0.4, out)).toBe(out);
        expect(Array.from(out)).toEqual(Array.from(Float32Array.from(lineageColor(9, 0.4))));
    });
});

describe('temperatureColor', () => {
    it('is deep blue at and below cold stress, cool white across the optimal band, orange at heat stress and above', () => {
        expect(temperatureColor(0, bands)).toEqual(PALETTE.coldWater);
        expect(temperatureColor(bands.cold, bands)).toEqual(PALETTE.coldWater);
        expect(temperatureColor(0.5, bands)).toEqual(PALETTE.coolWhite);
        expect(temperatureColor(bands.optimalMin, bands)).toEqual(PALETTE.coolWhite);
        expect(temperatureColor(bands.optimalMax, bands)).toEqual(PALETTE.coolWhite);
        expect(temperatureColor(bands.heat, bands)).toEqual(PALETTE.heat);
        expect(temperatureColor(1, bands)).toEqual(PALETTE.heat);
    });

    it('blends between the bands', () => {
        const mid = temperatureColor(0.35, bands);
        expect(mid[2]).toBeGreaterThan(PALETTE.coolWhite[2] - 0.5);
        expect(mid[0]).toBeCloseTo((PALETTE.coldWater[0] + PALETTE.coolWhite[0]) / 2, 6);
    });

    it('reads the bands from ready.info as shares of the maximum', () => {
        const b = temperatureBands({
            temperatureMax: 100,
            temperatureColdStress: 30,
            temperatureOptimalMin: 40,
            temperatureOptimalMax: 65,
            temperatureHeatStress: 85,
        });
        expect(b).toEqual({ cold: 0.3, optimalMin: 0.4, optimalMax: 0.65, heat: 0.85 });
    });

    it('fills a ramp whose first and last texels are the ends', () => {
        const ramp = temperatureRamp(bands, new Float32Array(64 * 4));
        expect(Array.from(ramp.slice(0, 3))).toEqual(Array.from(Float32Array.from(PALETTE.coldWater)));
        expect(Array.from(ramp.slice(63 * 4, 63 * 4 + 3))).toEqual(Array.from(Float32Array.from(PALETTE.heat)));
        expect(ramp[3]).toBe(1);
    });
});

describe('familyName', () => {
    it('is stable, carries the id and names the hue', () => {
        expect(familyName(12)).toBe(familyName(12));
        expect(familyName(0)).toBe('Red 0');
        expect(familyName(12)).toMatch(/^[A-Z][a-z]+ 12$/);
        const names = new Set(Array.from({ length: 100 }, (_, i) => familyName(i).split(' ')[0]));
        expect(names.size).toBeGreaterThanOrEqual(10);
    });
});
