import { describe, expect, it } from 'vitest';
import {
    STATIC_LINE_DIM,
    STATIC_SHIFT_PERIODS_S,
    STATIC_SHIFT_PX,
    staticLineDim,
    staticLineShift,
} from '../../../js/app/renderer/static-lines.js';

describe('staticLineDim', () => {
    it('keeps 60% of the brightness in TV mode and all of it otherwise', () => {
        expect(staticLineDim(true)).toBe(STATIC_LINE_DIM);
        expect(STATIC_LINE_DIM).toBe(0.6);
        expect(staticLineDim(false)).toBe(1);
    });
});

describe('staticLineShift', () => {
    it('is zero outside TV mode', () => {
        const out = { x: 9, y: 9 };
        expect(staticLineShift({ tv: false, nowMs: 123456, zoom: 2 }, out)).toBe(out);
        expect(out).toEqual({ x: 0, y: 0 });
    });

    it('stays inside STATIC_SHIFT_PX device px on each axis at any zoom and time', () => {
        const out = { x: 0, y: 0 };
        for (const zoom of [0.5, 1, 4]) {
            for (let s = 0; s < 3 * 3600; s += 17) {
                staticLineShift({ tv: true, nowMs: s * 1000, zoom }, out);
                expect(Math.abs(out.x) * zoom).toBeLessThanOrEqual(STATIC_SHIFT_PX + 1e-9);
                expect(Math.abs(out.y) * zoom).toBeLessThanOrEqual(STATIC_SHIFT_PX + 1e-9);
            }
        }
    });

    it('drifts slowly: under 2 px a minute on each axis, and it moves over an hour', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 0, y: 0 };
        let farthest = 0;
        for (let s = 0; s < 3600; s += 5) {
            staticLineShift({ tv: true, nowMs: s * 1000, zoom: 1 }, a);
            staticLineShift({ tv: true, nowMs: (s + 60) * 1000, zoom: 1 }, b);
            expect(Math.abs(b.x - a.x)).toBeLessThan(2);
            expect(Math.abs(b.y - a.y)).toBeLessThan(2);
            farthest = Math.max(farthest, Math.hypot(a.x, a.y));
        }
        expect(farthest).toBeGreaterThan(STATIC_SHIFT_PX / 2);
        expect(STATIC_SHIFT_PERIODS_S[0]).not.toBe(STATIC_SHIFT_PERIODS_S[1]);
    });

    it('converts device px to world units by the zoom', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 0, y: 0 };
        const t = (STATIC_SHIFT_PERIODS_S[0] / 4) * 1000;
        staticLineShift({ tv: true, nowMs: t, zoom: 1 }, a);
        staticLineShift({ tv: true, nowMs: t, zoom: 2 }, b);
        expect(a.x).toBeCloseTo(STATIC_SHIFT_PX);
        expect(b.x).toBeCloseTo(STATIC_SHIFT_PX / 2);
    });
});
