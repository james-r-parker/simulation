import { describe, expect, it } from 'vitest';
import {
    AURORA_MAX_LUMINANCE,
    AURORA_STOPS,
    auroraGain,
    auroraPhase,
    auroraTint,
} from '../../../js/app/renderer/aurora-tint.js';
import { luminance } from './helpers/color-metrics.js';

describe('aurora-tint', () => {
    it('returns exact season stops when progress is <= 0.7', () => {
        for (let s = 0; s < 4; s++) {
            const tint0 = auroraTint(s, 0);
            const tint7 = auroraTint(s, 0.7);
            for (let i = 0; i < 3; i++) {
                expect(tint0[i]).toBeCloseTo(AURORA_STOPS[s][i], 5);
                expect(tint7[i]).toBeCloseTo(AURORA_STOPS[s][i], 5);
            }
        }
    });

    it('smoothly blends towards the next season between 0.7 and 1.0', () => {
        const tint = auroraTint(0, 0.85); // between spring (0) and summer (1)
        expect(tint[0]).toBeGreaterThan(AURORA_STOPS[0][0]);
        expect(tint[0]).toBeLessThan(AURORA_STOPS[1][0]);
    });

    it('is C0 continuous across season and year boundaries', () => {
        for (let s = 0; s < 4; s++) {
            const endOfSeason = auroraTint(s, 1.0);
            const nextSeason = (s + 1) % 4;
            const startOfNext = auroraTint(nextSeason, 0.0);
            expect(endOfSeason[0]).toBeCloseTo(startOfNext[0], 5);
            expect(endOfSeason[1]).toBeCloseTo(startOfNext[1], 5);
            expect(endOfSeason[2]).toBeCloseTo(startOfNext[2], 5);
        }
    });

    it('satisfies warmth: summer is warmer (red minus blue) than winter', () => {
        const summerWarmth = AURORA_STOPS[1][0] - AURORA_STOPS[1][2];
        const winterWarmth = AURORA_STOPS[3][0] - AURORA_STOPS[3][2];
        expect(summerWarmth).toBeGreaterThan(winterWarmth);
    });

    it('never exceeds the luminance ceiling across all seasons and blends', () => {
        for (let s = 0; s < 4; s++) {
            for (let p = 0; p <= 1.0; p += 0.05) {
                const tint = auroraTint(s, p);
                const lum = luminance(tint);
                expect(lum).toBeLessThanOrEqual(AURORA_MAX_LUMINANCE * 1.0001);
            }
        }
    });

    it('gain wanders between 0.55 and 1.0 and differs by at least 0.1 in any 40s window', () => {
        let minGain = Infinity;
        let maxGain = -Infinity;
        for (let t = 0; t <= 40; t += 1) {
            const g = auroraGain(t);
            expect(g).toBeGreaterThanOrEqual(0.5499);
            expect(g).toBeLessThanOrEqual(1.0001);
            minGain = Math.min(minGain, g);
            maxGain = Math.max(maxGain, g);
        }
        expect(maxGain - minGain).toBeGreaterThanOrEqual(0.4);
    });

    it('phases advance every second and ribbons move by at least 0.5% per second', () => {
        const outA = new Float32Array(3);
        const outB = new Float32Array(3);
        auroraPhase(10, outA);
        auroraPhase(11, outB);

        expect(outB[0] - outA[0]).toBeCloseTo(0.011, 4);
        expect(outB[1] - outA[1]).toBeCloseTo(0.017, 4);
        expect(outB[2] - outA[2]).toBeCloseTo(0.023, 4);

        for (let i = 0; i < 3; i++) {
            const speed = outB[i] - outA[i];
            expect(speed).toBeGreaterThan(0.005);
        }
    });
});
