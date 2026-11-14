import { describe, expect, it } from 'vitest';
import {
    coverage,
    rimCoverage,
    sdArc,
    sdBlob,
    sdBox,
    sdCircle,
    sdDots,
    sdPoly,
    sdRing,
    sdSegment,
} from '../../../js/app/renderer/sdf-math.js';

describe('sdf primitives', () => {
    it('circle: negative inside, zero on the edge, positive outside', () => {
        expect(sdCircle(0, 0, 1)).toBe(-1);
        expect(sdCircle(1, 0, 1)).toBe(0);
        expect(sdCircle(0, 3, 1)).toBe(2);
    });

    it('ring: a band of the width, dashes cut gaps', () => {
        const ring = { radius: 1, width: 0.2 };
        expect(sdRing(1, 0, ring)).toBeCloseTo(-0.1);
        expect(sdRing(0, 0, ring)).toBeCloseTo(0.9);
        const dashed = { ...ring, dashes: 4 };
        // the middle of a dash (cell 0.5) is on the band, the middle of a gap (cell 0) is outside
        expect(sdRing(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), dashed)).toBeLessThan(0);
        expect(sdRing(1, 1e-6, dashed)).toBeGreaterThan(0);
    });

    it('box: rounded corners, exact on the faces', () => {
        const box = { hx: 2, hy: 1, corner: 0.5 };
        expect(sdBox(2, 0, box)).toBeCloseTo(0);
        expect(sdBox(0, 0, box)).toBeCloseTo(-1);
        expect(sdBox(2, 1, box)).toBeCloseTo(Math.SQRT2 * 0.5 - 0.5);
    });

    it('segment: a capsule of the width', () => {
        const seg = { a: [0, 0], b: [2, 0], width: 0.4 };
        expect(sdSegment(1, 0, seg)).toBeCloseTo(-0.2);
        expect(sdSegment(1, 1, seg)).toBeCloseTo(0.8);
        expect(sdSegment(3, 0, seg)).toBeCloseTo(0.8);
    });

    it('poly: a concave polygon is inside in its arms and outside in its notch', () => {
        const chevron = [
            [0, 1],
            [1, -1],
            [0, -0.2],
            [-1, -1],
        ];
        expect(sdPoly(0, 0.2, chevron)).toBeLessThan(0);
        expect(sdPoly(0, -0.6, chevron)).toBeGreaterThan(0);
        expect(sdPoly(0.5, 0, chevron)).toBeCloseTo(0, 5);
        const square = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ];
        expect(sdPoly(0, 0, square)).toBeCloseTo(-1);
        expect(sdPoly(3, 0, square)).toBeCloseTo(2);
    });

    it('arc: inside its sweep, capped at its ends, nothing at zero sweep', () => {
        const arc = { radius: 1, width: 0.2, start: 0, sweep: Math.PI / 2 };
        expect(sdArc(Math.cos(0.7), Math.sin(0.7), arc)).toBeCloseTo(-0.1);
        expect(sdArc(-1, 0, arc)).toBeGreaterThan(1);
        expect(sdArc(1, -0.1, arc)).toBeCloseTo(0, 5);
        expect(sdArc(1, 0, { ...arc, sweep: 0 })).toBe(Infinity);
    });

    it('dots: evenly round the ring, the first at the phase', () => {
        const dots = { radius: 0.1, count: 4, ring: 1, phase: 0 };
        expect(sdDots(1, 0, dots)).toBeCloseTo(-0.1);
        expect(sdDots(0, 1, dots)).toBeCloseTo(-0.1);
        expect(sdDots(Math.SQRT1_2, Math.SQRT1_2, dots)).toBeGreaterThan(0.5);
        expect(sdDots(0, 1, { ...dots, count: 1 })).toBeCloseTo(Math.SQRT2 - 0.1);
    });
});

describe('sdBlob', () => {
    it('is zero on the rockOutline outline at every angle', async () => {
        const { rockOutline, rockShape } = await import('../../../js/app/renderer/rock-shape.js');
        const shape = rockShape(7, 3);
        for (let a = 0; a < 6.28; a += 0.37) {
            const r = rockOutline(shape, a);
            expect(sdBlob(r * Math.cos(a), r * Math.sin(a), shape)).toBeCloseTo(0, 5);
        }
        expect(sdBlob(0, 0, shape)).toBeLessThan(0);
    });
});

describe('coverage', () => {
    it('is 0.5 on the edge and within 0.01 of 1 and 0 one pixel either side', () => {
        expect(coverage(0, 0.1)).toBeCloseTo(0.5);
        expect(coverage(-0.1, 0.1)).toBeGreaterThan(0.99);
        expect(coverage(0.1, 0.1)).toBeLessThan(0.01);
    });

    it('rim: centred on the edge, rimPx wide', () => {
        expect(rimCoverage(0, 1.5, 0.1)).toBe(1);
        expect(rimCoverage(0.075, 1.5, 0.1)).toBeCloseTo(0.5);
        expect(rimCoverage(-0.2, 1.5, 0.1)).toBe(0);
    });
});

describe('degenerate shapes', () => {
    it('treats a zero-length segment as a disc of half its width', () => {
        expect(sdSegment(3, 4, { a: [0, 0], b: [0, 0], width: 2 })).toBeCloseTo(4);
    });
});
