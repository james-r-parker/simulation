import { describe, expect, it } from 'vitest';
import { normalCdf, normalQuantile } from '../../js/evo/normal.js';
import * as compare from '../../js/evo/compare.js';

describe('normalCdf and normalQuantile', () => {
    it('hit the known values of the standard normal', () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 12);
        expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 9);
        expect(normalCdf(-40)).toBe(0);
        expect(normalCdf(40)).toBe(1);
        expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 7);
    });

    it('invert each other and refuse a probability outside (0, 1)', () => {
        for (const p of [0.001, 0.02, 0.3, 0.5, 0.9, 0.999]) {
            expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 9);
        }
        expect(() => normalQuantile(0)).toThrow(/\(0, 1\)/);
    });

    it('are the same functions compare.js exports', () => {
        expect(compare.normalCdf).toBe(normalCdf);
        expect(compare.normalQuantile).toBe(normalQuantile);
    });
});
