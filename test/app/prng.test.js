import { describe, expect, it } from 'vitest';
import { createPrng } from '../../js/app/prng.js';

describe('createPrng', () => {
    it('gives the same sequence for the same seed and different ones for different seeds', () => {
        const a = createPrng(42);
        const b = createPrng(42);
        const c = createPrng(43);
        const seqA = Array.from({ length: 8 }, () => a.next());
        expect(Array.from({ length: 8 }, () => b.next())).toEqual(seqA);
        expect(Array.from({ length: 8 }, () => c.next())).not.toEqual(seqA);
    });

    it('stays in [0, 1) and spreads over it', () => {
        const prng = createPrng(7);
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
            const v = prng.next();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
            sum += v;
        }
        expect(sum / 10000).toBeGreaterThan(0.48);
        expect(sum / 10000).toBeLessThan(0.52);
    });

    it('int(n) covers 0 to n-1 and nothing else', () => {
        const prng = createPrng(1);
        const seen = new Set();
        for (let i = 0; i < 500; i++) {
            seen.add(prng.int(5));
        }
        expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    });
});
