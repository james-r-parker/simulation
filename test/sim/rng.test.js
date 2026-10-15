import { describe, expect, it } from 'vitest';
import { createRng, fork, nextFloat, nextGaussian, nextInt } from '../../js/sim/rng.js';

const DRAWS = 100000;
const PINNED = [0.9680699775926769, 0.9730133968405426, 0.21474934834986925, 0.12609894713386893, 0.6878896737471223];

/**
 * @param {import('../../js/sim/rng.js').Rng} rng
 * @param {number} count
 * @returns {number[]}
 */
function sequence(rng, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push(nextFloat(rng));
    }
    return out;
}

describe('createRng', () => {
    it('gives the same sequence for the same seed', () => {
        expect(sequence(createRng(42), 50)).toEqual(sequence(createRng(42), 50));
    });

    it('gives different sequences for different seeds', () => {
        expect(sequence(createRng(1), 5)).not.toEqual(sequence(createRng(2), 5));
    });

    it('records the seed and a four-word state', () => {
        const rng = createRng(7);
        expect(rng.seed).toBe(7);
        expect(rng.s).toBeInstanceOf(Uint32Array);
        expect(rng.s.length).toBe(4);
    });

    it('accepts the extreme seeds', () => {
        expect(() => createRng(0)).not.toThrow();
        expect(() => createRng(4294967295)).not.toThrow();
    });

    it.each([1.5, -1, 4294967296, NaN, Infinity, '3'])('rejects seed %s', (seed) => {
        expect(() => createRng(/** @type {number} */ (seed))).toThrow(/createRng/);
    });

    // Self-pin: first computed from this implementation, as the contracts specify. It guards against drift.
    it('pins the first draws of seed 1', () => {
        expect(sequence(createRng(1), 5)).toEqual(PINNED);
    });
});

describe('nextFloat', () => {
    it('stays in [0, 1)', () => {
        const rng = createRng(3);
        for (let i = 0; i < DRAWS; i++) {
            const x = nextFloat(rng);
            expect(x >= 0 && x < 1).toBe(true);
        }
    });
});

describe('nextInt', () => {
    it('stays in [0, n)', () => {
        const rng = createRng(4);
        for (let i = 0; i < 1000; i++) {
            const x = nextInt(rng, 7);
            expect(Number.isInteger(x) && x >= 0 && x < 7).toBe(true);
        }
    });

    it('scales the float draw by n', () => {
        expect(nextInt(createRng(1), 1000)).toBe(Math.floor(PINNED[0] * 1000));
    });

    it('returns 0 for n = 1 and accepts n = 2^32', () => {
        const rng = createRng(5);
        expect(nextInt(rng, 1)).toBe(0);
        expect(nextInt(rng, 4294967296)).toBeLessThan(4294967296);
    });

    it.each([0, 1.5, 4294967297, -2, NaN])('rejects n = %s', (n) => {
        expect(() => nextInt(createRng(1), n)).toThrow(/nextInt/);
    });
});

describe('nextGaussian', () => {
    it('has mean near 0 and variance near 1', () => {
        const rng = createRng(6);
        let sum = 0;
        let sumSq = 0;
        for (let i = 0; i < DRAWS; i++) {
            const g = nextGaussian(rng);
            sum += g;
            sumSq += g * g;
        }
        const mean = sum / DRAWS;
        const variance = sumSq / DRAWS - mean * mean;
        expect(Math.abs(mean)).toBeLessThan(0.02);
        expect(Math.abs(variance - 1)).toBeLessThan(0.03);
    });

    it('uses exactly two uint32 draws per call', () => {
        const a = createRng(8);
        const b = createRng(8);
        for (let i = 0; i < 10; i++) {
            nextGaussian(a);
            nextFloat(b);
            nextFloat(b);
        }
        expect(Array.from(a.s)).toEqual(Array.from(b.s));
    });
});

describe('fork', () => {
    it('is deterministic', () => {
        expect(sequence(fork(createRng(9), 'food'), 10)).toEqual(sequence(fork(createRng(9), 'food'), 10));
    });

    it('does not move the parent', () => {
        const parent = createRng(9);
        const before = Array.from(parent.s);
        fork(parent, 'food');
        expect(Array.from(parent.s)).toEqual(before);
    });

    it('differs by name', () => {
        const parent = createRng(9);
        expect(sequence(fork(parent, 'food'), 5)).not.toEqual(sequence(fork(parent, 'mutation'), 5));
    });

    it('differs by parent seed', () => {
        expect(sequence(fork(createRng(9), 'food'), 5)).not.toEqual(sequence(fork(createRng(10), 'food'), 5));
    });

    it('rejects a non-ASCII name', () => {
        expect(() => fork(createRng(1), 'café')).toThrow(/fnv64String/);
    });
});
