import { describe, expect, it } from 'vitest';
import { createDents, DENT_TICKS, DENT_WIDTH, dentAt, startDent } from '../../../js/app/renderer/dents.js';

const OUT = { angle: 0, depth: 0, width: 0 };
const WHO = { slot: 2, genome: 7 };

describe('dents', () => {
    it('start at full depth towards the contact and ring out through a sign change', () => {
        const dents = createDents(4);
        expect(startDent(dents, WHO, { angle: 1.2, depth: 0.3, tick: 100 })).toBe(true);
        expect(dentAt(dents, { ...WHO, tick: 100 }, OUT)).toBe(true);
        expect(OUT.angle).toBeCloseTo(1.2);
        expect(OUT.depth).toBeCloseTo(0.3);
        expect(OUT.width).toBeCloseTo(DENT_WIDTH.from);
        let min = Infinity;
        for (let t = 0; t < DENT_TICKS; t++) {
            dentAt(dents, { ...WHO, tick: 100 + t }, OUT);
            min = Math.min(min, OUT.depth);
        }
        expect(min).toBeLessThan(0);
        expect(min).toBeGreaterThan(-0.1);
    });

    it('widens as it rings and ends after DENT_TICKS', () => {
        const dents = createDents(4);
        startDent(dents, WHO, { angle: 0, depth: 0.3, tick: 0 });
        dentAt(dents, { ...WHO, tick: DENT_TICKS - 1 }, OUT);
        expect(OUT.width).toBeGreaterThan(DENT_WIDTH.from);
        expect(dentAt(dents, { ...WHO, tick: DENT_TICKS }, OUT)).toBe(false);
        expect(dents.active[2]).toBe(0);
    });

    it('is dropped by a different body in the slot', () => {
        const dents = createDents(4);
        startDent(dents, WHO, { angle: 0, depth: 0.3, tick: 0 });
        expect(dentAt(dents, { slot: 2, genome: 8, tick: 1 }, OUT)).toBe(false);
    });

    it('a weaker dent does not replace a stronger running one, a stronger one does', () => {
        const dents = createDents(4);
        startDent(dents, WHO, { angle: 0, depth: 0.3, tick: 0 });
        expect(startDent(dents, WHO, { angle: 1, depth: 0.1, tick: 1 })).toBe(false);
        expect(startDent(dents, WHO, { angle: 1, depth: 0.5, tick: 1 })).toBe(true);
        expect(dents.angle[2]).toBeCloseTo(1);
    });

    it('ignores a slot past its capacity', () => {
        const dents = createDents(2);
        expect(startDent(dents, { slot: 5, genome: 1 }, { angle: 0, depth: 0.3, tick: 0 })).toBe(false);
        expect(dentAt(dents, { slot: 5, genome: 1, tick: 0 }, OUT)).toBe(false);
    });
});
