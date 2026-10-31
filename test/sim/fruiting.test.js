import { describe, expect, it } from 'vitest';
import { fruitWeight } from '../../js/sim/fruiting.js';

describe('fruitWeight', () => {
    it('matches a sine-squared reference over 1000 year phases', () => {
        for (const [start, span] of [
            [0, 1],
            [0.25, 0.3],
            [0.8, 0.4],
        ]) {
            for (let i = 0; i < 1000; i++) {
                const phase = i / 1000;
                const delta = phase >= start ? phase - start : 1 + phase - start;
                const expected = span === 1 ? 1 : delta >= span ? 0 : Math.sin((Math.PI * delta) / span) ** 2;
                expect(fruitWeight(phase, start, span)).toBeCloseTo(expected, 12);
            }
        }
    });

    it('wraps a window across the year boundary', () => {
        expect(fruitWeight(0, 0.8, 0.4)).toBeCloseTo(1, 12);
        expect(fruitWeight(0.5, 0.8, 0.4)).toBe(0);
        expect(fruitWeight(0.8, 0.8, 0.4)).toBe(0);
        expect(fruitWeight(0.2, 0.8, 0.4)).toBeCloseTo(0, 12);
    });

    it('keeps an all-year species at full weight including its opening', () => {
        expect(fruitWeight(0, 0, 1)).toBe(1);
        expect(fruitWeight(0.9, 0.3, 1)).toBe(1);
    });
});
