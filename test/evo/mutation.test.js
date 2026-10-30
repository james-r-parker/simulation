import { describe, expect, it } from 'vitest';
import {
    mutateSigma,
    mutateWeights,
    randomWeights,
    SIGMA_MAX,
    SIGMA_MIN,
    SIGMA_START,
    TRAIT_SIGMA,
    WEIGHT_CLAMP,
} from '../../js/evo/mutation.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { detExp } from '../../js/sim/det-math.js';
import { createRng, nextFloat, nextGaussian } from '../../js/sim/rng.js';

/**
 * @param {ArrayLike<number>} values the values
 * @returns {{ mean: number, sd: number }}
 */
function stats(values) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
    }
    const mean = sum / values.length;
    let sq = 0;
    for (let i = 0; i < values.length; i++) {
        sq += (values[i] - mean) ** 2;
    }
    return { mean, sd: Math.sqrt(sq / values.length) };
}

describe('constants', () => {
    it('names the bounds', () => {
        expect([SIGMA_MIN, SIGMA_MAX, SIGMA_START, WEIGHT_CLAMP]).toEqual([0.002, 0.5, 0.05, 4]);
    });
});

describe('mutateSigma', () => {
    it('is parentSigma x detExp(tau x N(0, 1)) with tau = 1 / sqrt(weightCount)', () => {
        const draw = nextGaussian(createRng(5));
        expect(mutateSigma(0.05, 400, createRng(5))).toBe(0.05 * detExp(draw / 20));
    });

    it('clamps at both ends', () => {
        expect(mutateSigma(10, 1, createRng(1))).toBe(SIGMA_MAX);
        expect(mutateSigma(1e-9, 1, createRng(1))).toBe(SIGMA_MIN);
    });

    it('is deterministic per stream', () => {
        expect(mutateSigma(0.05, 100, createRng(9))).toBe(mutateSigma(0.05, 100, createRng(9)));
    });
});

describe('mutateWeights', () => {
    it('changes every weight of a child', () => {
        const row = new Float32Array(500).fill(0.5);
        mutateWeights(row, 0.05, createRng(2));
        expect(row.every((w) => w !== 0.5)).toBe(true);
    });

    it('adds a delta with mean near 0 and variance near sigma squared', () => {
        const row = new Float32Array(20000);
        mutateWeights(row, 0.1, createRng(3));
        const { mean, sd } = stats(row);
        expect(Math.abs(mean)).toBeLessThan(0.005);
        expect(sd).toBeGreaterThan(0.097);
        expect(sd).toBeLessThan(0.103);
    });

    it('clamps to the weight bound', () => {
        const row = new Float32Array([4, -4, 3.99]).map((w) => w);
        mutateWeights(row, 0.5, createRng(4));
        expect(row.every((w) => Math.abs(w) <= WEIGHT_CLAMP)).toBe(true);
    });

    it('steps the genes from traitStart by TRAIT_SIGMA and draws the same number of Gaussians', () => {
        const rowA = new Float32Array(20000);
        const rowB = new Float32Array(20000);
        const rngA = createRng(7);
        const rngB = createRng(7);
        mutateWeights(rowA, 0.01, rngA);
        mutateWeights(rowB, 0.01, rngB, { traitStart: 10000 });
        expect(rngB.s).toEqual(rngA.s);
        expect(rowB.subarray(0, 10000)).toEqual(rowA.subarray(0, 10000));
        expect(stats(rowB.subarray(0, 10000)).sd).toBeLessThan(0.0105);
        const sd = stats(rowB.subarray(10000)).sd;
        expect(sd).toBeGreaterThan(0.97 * TRAIT_SIGMA);
        expect(sd).toBeLessThan(1.03 * TRAIT_SIGMA);
    });

    it('is the weight sigma throughout without a traitStart', () => {
        const a = new Float32Array(100);
        const b = new Float32Array(100);
        mutateWeights(a, 0.2, createRng(8));
        mutateWeights(b, 0.2, createRng(8), { traitStart: 100 });
        expect(b).toEqual(a);
    });

    it('writes through a subarray view', () => {
        const big = new Float32Array(10);
        mutateWeights(big.subarray(5), 0.1, createRng(6));
        expect(big.subarray(0, 5).every((w) => w === 0)).toBe(true);
        expect(big.subarray(5).every((w) => w !== 0)).toBe(true);
    });
});

describe('mutateWeights rate', () => {
    it('at rate 1 gives the same row and draws as no options', () => {
        const a = new Float32Array(300).fill(0.1);
        const b = new Float32Array(300).fill(0.1);
        const rngA = createRng(21);
        const rngB = createRng(21);
        mutateWeights(a, 0.05, rngA, { traitStart: 250 });
        mutateWeights(b, 0.05, rngB, { traitStart: 250, rate: 1 });
        expect(b).toEqual(a);
        expect(rngB.s).toEqual(rngA.s);
    });

    it('below 1 mutates about rate x length genes and leaves the rest bit-identical', () => {
        const row = new Float32Array(20000).fill(0.5);
        mutateWeights(row, 0.05, createRng(22), { rate: 0.1 });
        const hit = row.filter((w) => w !== 0.5).length;
        expect(hit).toBeGreaterThan(1850);
        expect(hit).toBeLessThan(2150);
    });

    it('below 1 draws one float per gene and one Gaussian per hit, in index order', () => {
        const row = new Float32Array(50);
        const ref = createRng(23);
        const expected = new Float32Array(50);
        for (let i = 0; i < 50; i++) {
            if (nextFloat(ref) < 0.3) {
                expected[i] = Math.fround(0.05 * nextGaussian(ref));
            }
        }
        const rng = createRng(23);
        mutateWeights(row, 0.05, rng, { rate: 0.3 });
        expect(row).toEqual(expected);
        expect(rng.s).toEqual(ref.s);
    });

    it('uses TRAIT_SIGMA for the trait genes on a hit', () => {
        const row = new Float32Array(40000);
        mutateWeights(row, 0.001, createRng(24), { traitStart: 20000, rate: 0.5 });
        const traits = Array.from(row.subarray(20000)).filter((w) => w !== 0);
        expect(stats(traits).sd).toBeGreaterThan(0.9 * TRAIT_SIGMA);
        expect(stats(traits).sd).toBeLessThan(1.1 * TRAIT_SIGMA);
    });
});

describe('randomWeights', () => {
    const layout = brainLayout({ rayCount: 8, brainHidden: 64 });
    const row = new Float32Array(layout.weightCount).fill(9);
    const LEAK_GENE_START = 3;
    randomWeights(row, layout, createRng(11), LEAK_GENE_START);

    it('draws hidden-input blocks with sd 1 / sqrt(inputCount + hidden)', () => {
        const expected = 1 / Math.sqrt(layout.inputCount + layout.hidden);
        for (const block of [row.subarray(layout.wIn, layout.bHidden)]) {
            const { mean, sd } = stats(block);
            expect(Math.abs(mean)).toBeLessThan(expected * 0.1);
            expect(sd / expected).toBeGreaterThan(0.95);
            expect(sd / expected).toBeLessThan(1.05);
        }
    });

    it('draws output weights with sd 1 / sqrt(hidden)', () => {
        const expected = 1 / Math.sqrt(layout.hidden);
        const { sd } = stats(row.subarray(layout.wOut, layout.bOut));
        expect(sd / expected).toBeGreaterThan(0.85);
        expect(sd / expected).toBeLessThan(1.15);
    });

    it('starts biases at 0', () => {
        expect(row.subarray(layout.bHidden, layout.wOut).every((w) => w === 0)).toBe(true);
        expect(row.subarray(layout.bOut, layout.traitStart).every((w) => w === 0)).toBe(true);
    });

    it('starts leak genes at the leakGeneStart it is given', () => {
        const other = new Float32Array(layout.weightCount);
        randomWeights(other, layout, createRng(11), -1);
        expect(other.subarray(layout.leakStart).every((w) => w === -1)).toBe(true);
        expect(other.subarray(0, layout.leakStart)).toEqual(row.subarray(0, layout.leakStart));
    });

    it('starts trait genes at 0 and leak genes at LEAK_GENE_START', () => {
        expect(row.subarray(layout.traitStart, layout.leakStart).every((w) => w === 0)).toBe(true);
        expect(row.subarray(layout.leakStart).length).toBe(layout.hidden);
        expect(row.subarray(layout.leakStart).every((w) => w === LEAK_GENE_START)).toBe(true);
    });

    it('is deterministic per stream', () => {
        const again = new Float32Array(layout.weightCount);
        randomWeights(again, layout, createRng(11), LEAK_GENE_START);
        expect(again).toEqual(row);
    });
});
