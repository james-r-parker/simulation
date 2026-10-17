import { describe, expect, it } from 'vitest';
import { easeOut, smoothstep } from '../../../js/app/renderer/curves.js';

describe('curves', () => {
    it('easeOut runs 0 to 1, fast first, and is monotonic', () => {
        expect(easeOut(0)).toBe(0);
        expect(easeOut(1)).toBe(1);
        expect(easeOut(0.5)).toBeGreaterThan(0.5);
        let last = -1;
        for (let t = 0; t <= 1; t += 0.05) {
            expect(easeOut(t)).toBeGreaterThanOrEqual(last);
            last = easeOut(t);
        }
    });

    it('smoothstep clamps outside the edges and is 0.5 in the middle', () => {
        expect(smoothstep(0.55, 1, 0.2)).toBe(0);
        expect(smoothstep(0.55, 1, 1.5)).toBe(1);
        expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    });
});
