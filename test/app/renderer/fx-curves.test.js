import { describe, expect, it } from 'vitest';
import {
    CURVE,
    curveAt,
    easeAt,
    FX_CURVES,
    FX_EASE,
    FX_MOTIONS,
    FX_SHAPES,
    keysAt,
} from '../../../js/app/renderer/fx-curves.js';

describe('FX_CURVES', () => {
    it('names a known shape, motion and ease and four keys each, with unique names', () => {
        const names = new Set();
        for (const c of FX_CURVES) {
            expect(FX_SHAPES).toContain(c.shape);
            expect(FX_MOTIONS).toContain(c.motion);
            expect(FX_EASE).toContain(c.ease);
            expect(c.scale).toHaveLength(4);
            expect(c.alpha).toHaveLength(4);
            names.add(c.name);
        }
        expect(names.size).toBe(FX_CURVES.length);
        expect(CURVE.streak).toBe(0);
    });

    it('every curve fades to nothing by the end of its life', () => {
        for (const c of FX_CURVES) {
            expect(c.alpha[3]).toBe(0);
        }
    });
});

describe('easeAt and keysAt', () => {
    it('every ease starts at 0 and ends at 1', () => {
        FX_EASE.forEach((_, id) => {
            expect(easeAt(0, id)).toBeCloseTo(0, 2);
            expect(easeAt(1, id)).toBeCloseTo(1, 6);
        });
    });

    it('backOut and elasticOut overshoot; quadOut leads quadIn', () => {
        expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => easeAt(t, 5)))).toBeGreaterThan(1);
        expect(easeAt(0.2, 6)).toBeGreaterThan(1);
        expect(easeAt(0.3, 2)).toBeGreaterThan(easeAt(0.3, 1));
    });

    it('keys are linear between 0, 1/3, 2/3 and 1 and clamp outside', () => {
        const k = [0, 3, 6, 0];
        expect(keysAt(k, 1 / 6)).toBeCloseTo(1.5);
        expect(keysAt(k, 0.5)).toBeCloseTo(4.5);
        expect(keysAt(k, 1)).toBe(0);
        expect(keysAt(k, 2)).toBe(0);
        expect(keysAt(k, -1)).toBe(0);
    });

    it('curveAt keys the eased age', () => {
        const out = curveAt(FX_CURVES[CURVE.ring], 0.5, { scale: 0, alpha: 0, t: 0 });
        expect(out.t).toBeCloseTo(easeAt(0.5, 2));
        expect(out.scale).toBeCloseTo(keysAt([0.05, 0.6, 0.85, 1], out.t));
    });
});
