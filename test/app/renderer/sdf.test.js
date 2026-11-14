import { describe, expect, it } from 'vitest';
import { float, vec2, vec3 } from 'three/tsl';
import {
    coverage,
    rimCoverage,
    sdArc,
    sdBlob,
    sdBox,
    sdCircle,
    sdDots,
    sdMembrane,
    sdPoly,
    sdRing,
    sdSegment,
    sdWave,
} from '../../../js/app/renderer/sdf.js';

const P = vec2(0.3, -0.2);
const SQUARE = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
];

describe('sdf nodes', () => {
    it('builds a node for every primitive from numbers or nodes', () => {
        const built = [
            sdCircle(P, 1),
            sdCircle(P, float(0.5)),
            sdRing(P, { radius: 1, width: 0.1 }),
            sdRing(P, { radius: float(1), width: 0.1, dashes: 8 }),
            sdBox(P, { hx: 1, hy: 0.5, corner: 0.2 }),
            sdSegment(P, { a: [0, 0], b: [1, 0], width: 0.1 }),
            sdSegment(P, { a: vec2(0, 0), b: vec2(float(1), 0), width: float(0.1) }),
            sdPoly(P, SQUARE),
            sdArc(P, { radius: 1, width: 0.1, start: 0, sweep: float(1) }),
            sdDots(P, { radius: 0.1, count: 3, ring: 0.6 }),
            sdBlob(P, { amp: vec3(0.1, 0.2, 0.1), phase: vec3(0, 1, 2) }),
            sdMembrane(P, { rx: 1, ry: 0.7, amp: 0.05, lobes: 5, phase: float(0.3) }),
            sdWave(P, { from: -0.8, to: -1.8, amp: 0.2, freq: 6, phase: float(1), width: 0.06 }),
            coverage(float(0), 0.01),
            rimCoverage(float(0), 1.5, float(0.01)),
        ];
        for (const node of built) {
            expect(node.isNode).toBe(true);
        }
    });
});
