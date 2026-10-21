import { describe, expect, it } from 'vitest';
import { drawnRadius, MIN_PX_HUNTER, MIN_PX_OTHER, minPxTable } from '../../js/app/display-size.js';

describe('drawnRadius', () => {
    it('keeps a big agent at its size and widens a small one to the minimum across', () => {
        expect(drawnRadius(40, 16, 1)).toBe(40);
        expect(drawnRadius(2, 16, 1)).toBe(8);
        expect(drawnRadius(2, 16, 0.25)).toBe(32);
    });

    it('gives a diameter of exactly the minimum in device px once widened', () => {
        for (const zoom of [0.1, 0.5, 2]) {
            expect(drawnRadius(0.01, MIN_PX_HUNTER, zoom) * 2 * zoom).toBeCloseTo(MIN_PX_HUNTER);
        }
    });
});

describe('minPxTable', () => {
    it('gives hunters 16 px and every other type 12', () => {
        const info = { specs: [{ canHunt: true }, { canHunt: false }, { canHunt: false }] };
        expect(minPxTable(info)).toEqual([MIN_PX_HUNTER, MIN_PX_OTHER, MIN_PX_OTHER]);
        expect([MIN_PX_HUNTER, MIN_PX_OTHER]).toEqual([16, 12]);
    });
});
