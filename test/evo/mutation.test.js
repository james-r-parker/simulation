import { describe, expect, it } from 'vitest';
import {
    LEAK_GENE_START,
    mutateSigma,
    mutateWeights,
    randomWeights,
    SIGMA_MAX,
    SIGMA_MIN,
    SIGMA_START,
    WEIGHT_CLAMP,
} from '../../js/evo/mutation.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { detExp } from '../../js/sim/det-math.js';
import { createRng, nextGaussian } from '../../js/sim/rng.js';

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

    it('writes through a subarray view', () => {
        const big = new Float32Array(10);
        mutateWeights(big.subarray(5), 0.1, createRng(6));
        expect(big.subarray(0, 5).every((w) => w === 0)).toBe(true);
        expect(big.subarray(5).every((w) => w !== 0)).toBe(true);
    });
});

describe('randomWeights', () => {
    const layout = brainLayout({ rayCount: 8, brainHidden: 64 });
    const row = new Float32Array(layout.weightCount).fill(9);
    randomWeights(row, layout, createRng(11));

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

    it('starts trait genes at 0 and leak genes at LEAK_GENE_START', () => {
        expect(row.subarray(layout.traitStart, layout.leakStart).every((w) => w === 0)).toBe(true);
        expect(row.subarray(layout.leakStart).length).toBe(layout.hidden);
        expect(row.subarray(layout.leakStart).every((w) => w === LEAK_GENE_START)).toBe(true);
    });

    it('is deterministic per stream', () => {
        const again = new Float32Array(layout.weightCount);
        randomWeights(again, layout, createRng(11));
        expect(again).toEqual(row);
    });
});
