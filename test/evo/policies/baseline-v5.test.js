import { describe, expect, it } from 'vitest';
import { createBaselineV5 } from '../../../js/evo/policies/baseline-v5.js';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { createRng, nextFloat, nextGaussian } from '../../../js/sim/rng.js';

const N = 20000;

/**
 * @param {number} count
 * @param {number} [motherValue]
 * @param {number} [fatherValue]
 * @returns {Record<string, any>} a world with a mother in slot 0 and a child in slot 1
 */
function makeWorld(count, motherValue = 0, fatherValue = 0) {
    return {
        config: {},
        layout: { weightCount: count, traitStart: count, leakStart: count }, // no extra genes
        weights: new Float32Array(count * 2).fill(0, count).fill(motherValue, 0, count),
        fatherWeights: new Float32Array(count * 2).fill(fatherValue),
    };
}

/** @param {number[]} xs */
const stats = (xs) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return { mean, sd };
};

describe('baseline-v5', () => {
    const { brain, fitnessName } = createBaselineV5();

    it('names its fitness v5', () => {
        expect(fitnessName).toBe('v5');
    });

    it('initialises every weight from N(0, 0.1)', () => {
        const world = makeWorld(N);
        brain.initBrain(world, 0, createRng(1));
        const { mean, sd } = stats(Array.from(world.weights.subarray(0, N)));
        expect(Math.abs(mean)).toBeLessThan(0.005);
        expect(sd).toBeGreaterThan(0.095);
        expect(sd).toBeLessThan(0.105);
    });

    it('initBrain writes only its own slot', () => {
        const world = makeWorld(4, 7);
        brain.initBrain(world, 1, createRng(1));
        expect(Array.from(world.weights.subarray(0, 4))).toEqual([7, 7, 7, 7]);
        expect(world.weights[4]).not.toBe(0);
    });

    it('mutates a split child with sigma 0.03 plus rare macro steps, never touching the father row', () => {
        const world = makeWorld(N);
        brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(2) });
        const deltas = Array.from(world.weights.subarray(N));
        const macro = deltas.filter((d) => Math.abs(d) > 0.15).length / N;
        // 0.02 chance of an extra N(0, 0.3): about 0.02 * P(|x| > 0.15) of deltas are large
        expect(macro).toBeGreaterThan(0.008);
        expect(macro).toBeLessThan(0.02);
        const small = deltas.filter((d) => Math.abs(d) <= 0.15);
        expect(stats(small).sd).toBeGreaterThan(0.028);
        expect(stats(small).sd).toBeLessThan(0.034);
    });

    it('draws a split child as two draws plus a macro draw per weight (no crossover draw)', () => {
        const world = makeWorld(3, 1);
        brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(3) });
        const rng = createRng(3);
        for (let i = 0; i < 3; i++) {
            let w = 1 + nextGaussian(rng) * 0.03;
            if (nextFloat(rng) < 0.02) {
                w += nextGaussian(rng) * 0.3;
            }
            expect(world.weights[3 + i]).toBeCloseTo(w, 6);
        }
    });

    it('takes about half the weights from the father on a mating, with one extra draw per weight', () => {
        const world = makeWorld(N, 1, -1);
        brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.MATE, rng: createRng(4) });
        const fromFather = Array.from(world.weights.subarray(N)).filter((w) => w < 0).length / N;
        expect(fromFather).toBeGreaterThan(0.48);
        expect(fromFather).toBeLessThan(0.52);
        const rng = createRng(4);
        const w0 = nextFloat(rng) < 0.5 ? -1 : 1;
        let expected = w0 + nextGaussian(rng) * 0.03;
        if (nextFloat(rng) < 0.02) {
            expected += nextGaussian(rng) * 0.3;
        }
        expect(world.weights[N]).toBeCloseTo(expected, 6);
    });

    it('does not read the father row for splits', () => {
        const world = makeWorld(50, 1, 100);
        brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(5) });
        expect(Math.max(...world.weights.subarray(50))).toBeLessThan(2);
    });

    it('uses the father row at the mother slot', () => {
        const world = makeWorld(2, 0, 0);
        world.fatherWeights.set([0.5, 0.5], 0);
        world.fatherWeights.set([-2, -2], 2);
        brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.MATE, rng: createRng(6) });
        for (const w of world.weights.subarray(2)) {
            expect(Math.abs(w - 0.5) < 0.5 || Math.abs(w) < 0.5).toBe(true);
        }
    });

    it('clamps weights to -3..3', () => {
        const high = makeWorld(2000, 3);
        brain.childBrain(high, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(7) });
        expect(Math.max(...high.weights.subarray(2000))).toBe(3);
        const low = makeWorld(2000, -3);
        brain.childBrain(low, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(7) });
        expect(Math.min(...low.weights.subarray(2000))).toBe(-3);
    });

    describe('with trait and leak genes', () => {
        const layout = { weightCount: 10, traitStart: 5, leakStart: 8 };
        /**
         * @param {Record<string, any>} config
         * @returns {Record<string, any>}
         */
        const on = (config) => ({ ...makeWorld(10, 0.5), layout, config });

        it('starts trait genes at 0 and leak genes at LEAK_GENE_START', () => {
            const world = on({});
            brain.initBrain(world, 1, createRng(1));
            expect(Array.from(world.weights.subarray(15, 18))).toEqual([0, 0, 0]);
            expect(Array.from(world.weights.subarray(18, 20))).toEqual([3, 3]);
            expect(world.weights[10]).not.toBe(0);
        });

        it('mutates the genes with TRAIT_SIGMA, clamped to 4, drawing as before', () => {
            const world = on({});
            world.weights.fill(4, 5, 10);
            const draws = [];
            const rng = createRng(9);
            brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng });
            const ref = createRng(9);
            for (let i = 0; i < 5; i++) {
                nextGaussian(ref);
                nextFloat(ref);
            }
            for (let i = 5; i < 10; i++) {
                draws.push(Math.min(4, 4 + nextGaussian(ref) * 0.1));
            }
            expect(Array.from(world.weights.subarray(15))).toEqual(draws.map((d) => Math.fround(d)));
        });
    });
});
