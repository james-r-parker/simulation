import { describe, expect, it } from 'vitest';
import { DEFAULT_INIT_SCALE, DEFAULT_MUTATION_SIGMA, cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createRng, nextGaussian } from '../../js/sim/rng.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {number[]} values
 * @returns {number} the root mean square
 */
function rms(values) {
    return Math.sqrt(values.reduce((p, c) => p + c * c, 0) / values.length);
}

describe('cloneWithNoisePolicy defaults', () => {
    it('names its defaults', () => {
        expect(DEFAULT_INIT_SCALE).toBe(1);
        expect(DEFAULT_MUTATION_SIGMA).toBe(0.02);
    });
});

describe('initBrain', () => {
    const world = () => smallWorld({ brainHidden: 16, rayCount: 8 });

    it('is deterministic for a seed and differs between seeds', () => {
        const a = world();
        const b = world();
        const c = world();
        const policy = cloneWithNoisePolicy();
        policy.initBrain(a, 0, createRng(5));
        policy.initBrain(b, 0, createRng(5));
        policy.initBrain(c, 0, createRng(6));
        expect(a.weights).toEqual(b.weights);
        expect(a.weights).not.toEqual(c.weights);
    });

    it('sets every bias to zero', () => {
        const w = world();
        const { layout } = w;
        cloneWithNoisePolicy().initBrain(w, 1, createRng(1));
        const base = layout.weightCount;
        for (let j = 0; j < layout.hidden; j++) {
            expect(w.weights[base + layout.bHidden + j]).toBe(0);
        }
        for (let o = 0; o < layout.outputCount; o++) {
            expect(w.weights[base + layout.bOut + o]).toBe(0);
        }
    });

    it('scales hidden-side weights by 1 / sqrt(fan-in) and output weights by 1 / sqrt(hidden)', () => {
        const w = world();
        const { layout } = w;
        cloneWithNoisePolicy().initBrain(w, 0, createRng(2));
        const hiddenSide = Array.from(w.weights.subarray(0, layout.bHidden));
        const out = Array.from(w.weights.subarray(layout.wOut, layout.bOut));
        const expectedHidden = 1 / Math.sqrt(layout.inputCount + layout.hidden);
        expect(Math.abs(rms(hiddenSide) / expectedHidden - 1)).toBeLessThan(0.1);
        expect(Math.abs(rms(out) / (1 / Math.sqrt(layout.hidden)) - 1)).toBeLessThan(0.1);
    });

    it('multiplies the weights by initScale', () => {
        const a = world();
        const b = world();
        cloneWithNoisePolicy().initBrain(a, 0, createRng(3));
        cloneWithNoisePolicy({ initScale: 2 }).initBrain(b, 0, createRng(3));
        expect(b.weights[0]).toBeCloseTo(2 * a.weights[0], 5);
    });
});

describe('childBrain', () => {
    const SIGMA = 0.1;

    /** @returns {{w: ReturnType<typeof smallWorld>, opts: {cause: number, rng: import('../../js/sim/rng.js').Rng}}} */
    function setup() {
        const w = smallWorld({ brainHidden: 16, rayCount: 8 });
        cloneWithNoisePolicy().initBrain(w, 0, createRng(9));
        return { w, opts: { cause: 0, rng: createRng(4) } };
    }

    it('writes the mother row plus noise with the requested sigma', () => {
        const { w, opts } = setup();
        cloneWithNoisePolicy({ mutationSigma: SIGMA }).childBrain(w, 1, 0, opts);
        const n = w.layout.weightCount;
        const diff = Array.from({ length: n }, (_, i) => w.weights[n + i] - w.weights[i]);
        expect(Math.abs(rms(diff) / SIGMA - 1)).toBeLessThan(0.1);
    });

    it('ignores the father', () => {
        const a = setup();
        const b = setup();
        b.w.fatherWeights.fill(7);
        b.w.fatherId[0] = 99;
        const policy = cloneWithNoisePolicy();
        policy.childBrain(a.w, 1, 0, a.opts);
        policy.childBrain(b.w, 1, 0, b.opts);
        expect(a.w.weights).toEqual(b.w.weights);
    });

    it('draws exactly weightCount gaussians from the stream', () => {
        const { w, opts } = setup();
        cloneWithNoisePolicy().childBrain(w, 1, 0, opts);
        const reference = createRng(4);
        for (let i = 0; i < w.layout.weightCount; i++) {
            nextGaussian(reference);
        }
        expect(nextGaussian(opts.rng)).toBe(nextGaussian(reference));
    });
});

describe('cloneWithNoisePolicy exact values', () => {
    const world = () => smallWorld({ brainHidden: 16, rayCount: 8 });

    it('writes each weight from the gaussian stream into the slot row only', () => {
        const w = world();
        const { layout } = w;
        const n = layout.weightCount;
        w.weights.fill(9);
        cloneWithNoisePolicy({ initScale: 2.5 }).initBrain(w, 1, createRng(11));
        const ref = createRng(11);
        for (let i = 0; i < n; i++) {
            let expected = 0;
            if (i < layout.bHidden) {
                expected = (nextGaussian(ref) * 2.5) / Math.sqrt(layout.inputCount + layout.hidden);
            } else if (i >= layout.wOut && i < layout.bOut) {
                expected = (nextGaussian(ref) * 2.5) / Math.sqrt(layout.hidden);
            } else if (i >= layout.wSkip && i < layout.traitStart) {
                expected = (nextGaussian(ref) * 2.5) / Math.sqrt(48);
            }
            expect(w.weights[n + i]).toBe(Math.fround(expected));
        }
        expect(w.weights[0]).toBe(9);
        expect(w.weights[2 * n]).toBe(9);
    });

    it('writes the child row as the mother row plus sigma-scaled noise and leaves other rows alone', () => {
        const w = world();
        const n = w.layout.weightCount;
        w.weights.fill(9);
        for (let i = 0; i < n; i++) {
            w.weights[n + i] = i / 100;
        }
        const rng = createRng(21);
        cloneWithNoisePolicy({ mutationSigma: 0.3 }).childBrain(w, 2, 1, { cause: 0, rng });
        const ref = createRng(21);
        for (let i = 0; i < n; i++) {
            expect(w.weights[2 * n + i]).toBe(Math.fround(Math.fround(i / 100) + nextGaussian(ref) * 0.3));
        }
        expect(w.weights[3 * n]).toBe(9);
        expect(w.weights[n + 1]).toBe(Math.fround(1 / 100));
    });
});
