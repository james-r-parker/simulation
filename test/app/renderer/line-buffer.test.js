import { describe, expect, it } from 'vitest';
import {
    clearLines,
    createLineBuffer,
    pushCircle,
    pushRay,
    pushVertex,
    setLineColor,
} from '../../../js/app/renderer/line-buffer.js';

describe('line buffer', () => {
    it('writes vertices in the current colour and clears to reuse', () => {
        const b = createLineBuffer(4);
        setLineColor(b, [0.1, 0.2, 0.3], 0.5);
        pushVertex(b, 1, 2);
        setLineColor(b, [1, 1, 1], 1);
        pushVertex(b, 3, 4);
        expect(b.vertices).toBe(2);
        expect(Array.from(b.position.slice(0, 6))).toEqual([1, 2, 0, 3, 4, 0]);
        expect(b.color[3]).toBe(0.5);
        expect(b.color[7]).toBe(1);
        clearLines(b);
        expect(b.vertices).toBe(0);
    });

    it('drops vertices past the capacity', () => {
        const b = createLineBuffer(1);
        for (let i = 0; i < 5; i++) {
            pushVertex(b, i, i);
        }
        expect(b.vertices).toBe(2);
    });

    it('adds a ray along an angle and a circle of segments', () => {
        const b = createLineBuffer(40);
        pushRay(b, 10, 10, { angle: Math.PI / 2, length: 5 });
        expect(b.position[3]).toBeCloseTo(10);
        expect(b.position[4]).toBeCloseTo(15);
        pushCircle(b, { x: 0, y: 0, radius: 2, sides: 8 });
        expect(b.vertices).toBe(2 + 16);
        expect(Math.hypot(b.position[3 * 4], b.position[3 * 4 + 1])).toBeCloseTo(2);
    });
});
