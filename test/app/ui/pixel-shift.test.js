import { describe, expect, it } from 'vitest';
import { applyPixelShift, pixelShiftAt, SHIFT_AMPLITUDE_PX, SHIFT_PERIODS_S } from '../../../js/app/ui/pixel-shift.js';

describe('pixelShiftAt', () => {
    it('never leaves 4 px on either axis over a day', () => {
        for (let t = 0; t < 86400; t += 37) {
            const { x, y } = pixelShiftAt(t);
            expect(Math.abs(x)).toBeLessThanOrEqual(SHIFT_AMPLITUDE_PX);
            expect(Math.abs(y)).toBeLessThanOrEqual(SHIFT_AMPLITUDE_PX);
        }
    });

    it('repeats each axis at its own period and the whole path at the product of them', () => {
        const [a, b] = SHIFT_PERIODS_S;
        expect(pixelShiftAt(a).x).toBeCloseTo(pixelShiftAt(0).x);
        expect(pixelShiftAt(b).y).toBeCloseTo(pixelShiftAt(0).y);
        expect(pixelShiftAt(a / 4).x).toBeCloseTo(SHIFT_AMPLITUDE_PX);
        expect(pixelShiftAt(100).y).not.toBeCloseTo(pixelShiftAt(100).x);
    });

    it('visits many different whole-pixel offsets, so no pixel stays lit', () => {
        const seen = new Set();
        for (let t = 0; t < 7 * 11 * 60; t += 60) {
            const { x, y } = pixelShiftAt(t);
            seen.add(`${Math.round(x)},${Math.round(y)}`);
        }
        expect(seen.size).toBeGreaterThan(30);
    });
});

describe('applyPixelShift', () => {
    it('moves every node by the rounded offset and writes only on a change', () => {
        const nodes = [{ style: { transform: '' } }, { style: { transform: '' } }];
        const last = { x: 0, y: 0 };
        const t = 100;
        const { x, y } = pixelShiftAt(t);
        expect(applyPixelShift(nodes, t, last)).toBe(true);
        expect(nodes[0].style.transform).toBe(`translate(${Math.round(x)}px, ${Math.round(y)}px)`);
        expect(nodes[1].style.transform).toBe(nodes[0].style.transform);
        expect(applyPixelShift(nodes, t, last)).toBe(false);
    });

    it('clears the transform at a zero offset', () => {
        let zero = -1;
        for (let t = 0; t < 7 * 11 * 60 && zero < 0; t++) {
            const { x, y } = pixelShiftAt(t);
            zero = Math.round(x) === 0 && Math.round(y) === 0 ? t : -1;
        }
        expect(zero).toBeGreaterThanOrEqual(0);
        const nodes = [{ style: { transform: 'translate(1px, 1px)' } }];
        expect(applyPixelShift(nodes, zero, { x: 1, y: 1 })).toBe(true);
        expect(nodes[0].style.transform).toBe('');
    });
});
