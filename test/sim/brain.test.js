import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { detTanh } from '../../js/sim/det-math.js';
import { OUTPUT_INDEX, POOLED_VALUES } from '../../js/sim/brain-layout.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { createRng, nextGaussian, nextFloat } from '../../js/sim/rng.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} seed the seed
 * @param {number[]} slots the slots to make alive and randomise
 * @returns {void}
 */
function randomise(world, seed, slots) {
    const rng = createRng(seed);
    for (const slot of slots) {
        world.alive[slot] = 1;
        const { weightCount, rawInputCount, hidden, outputCount } = world.layout;
        for (let i = 0; i < weightCount; i++) {
            world.weights[slot * weightCount + i] = nextGaussian(rng);
        }
        for (let i = 0; i < rawInputCount; i++) {
            const r = nextFloat(rng);
            world.inputs[slot * rawInputCount + i] = r < 0.5 ? 0 : r < 0.6 ? -0 : nextGaussian(rng);
        }
        for (let j = 0; j < hidden; j++) {
            world.hidden[slot * hidden + j] = Math.tanh(nextGaussian(rng));
        }
        world.outputs.fill(0, slot * outputCount, (slot + 1) * outputCount);
    }
}

/**
 * Straightforward per-agent reference in the contract order.
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} slot the slot
 * @returns {{outputs: number[], hidden: number[]}}
 */
function reference(world, slot) {
    const {
        weightCount,
        inputCount,
        hidden: H,
        outputCount: OUT,
        wIn,
        wRec,
        bHidden,
        wOut,
        bOut,
        wSkip,
    } = world.layout;
    const GENES = OUT - 1;
    const w = (/** @type {number} */ i) => world.weights[slot * weightCount + i];
    poolRays(world, slot);
    const next = [];
    for (let j = 0; j < H; j++) {
        let sum = w(bHidden + j);
        for (let i = 0; i < inputCount; i++) {
            const x = world.pooled[slot * inputCount + i];
            if (x !== 0) {
                sum += w(wIn + i * H + j) * x;
            }
        }
        for (let k = 0; k < H; k++) {
            sum += w(wRec + k * H + j) * world.hidden[slot * H + k];
        }
        next.push(Math.fround(detTanh(sum)));
    }
    const outputs = [];
    for (let o = 0; o < OUT; o++) {
        if (o === OUTPUT_INDEX.SPLIT) {
            outputs.push(0); // no genes: reads 0
            continue;
        }
        const c = o < OUTPUT_INDEX.SPLIT ? o : o - 1; // the gene column: the outputs after SPLIT shift down one
        let sum = w(bOut + c);
        for (let j = 0; j < H; j++) {
            sum += w(wOut + j * GENES + c) * next[j];
        }
        for (let i = 0; i < POOLED_VALUES; i++) {
            sum += w(wSkip + i * GENES + c) * world.pooled[slot * inputCount + i];
        }
        outputs.push(Math.fround(detTanh(sum)));
    }
    return { outputs, hidden: next };
}

/**
 * @param {ReturnType<typeof smallWorld>} world a world whose slot 1 has pooled values
 * @returns {number} the first nonzero pooled value's index in slot 1
 */
function firstPooled(world) {
    const raw = world.layout.rawInputCount;
    world.inputs[raw] = 0.5;
    world.inputs[raw + 1] = 0.5;
    poolRays(world, 1);
    const at = world.layout.inputCount;
    const found = Array.from(world.pooled.subarray(at, at + POOLED_VALUES)).findIndex((x) => x !== 0);
    expect(found).toBeGreaterThanOrEqual(0);
    return found;
}

describe('forwardAll', () => {
    it('matches a naive reference bit for bit on random worlds', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const world = smallWorld();
            randomise(world, seed, [0, 2, 3, 6]);
            const expected = [0, 2, 3, 6].map((s) => reference(world, s));
            forwardAll(world);
            [0, 2, 3, 6].forEach((slot, n) => {
                const { hidden: H, outputCount: OUT } = world.layout;
                expect(Array.from(world.hidden.subarray(slot * H, (slot + 1) * H))).toEqual(expected[n].hidden);
                expect(Array.from(world.outputs.subarray(slot * OUT, (slot + 1) * OUT))).toEqual(expected[n].outputs);
            });
        }
    });

    it.each([4, 7, 8, 32])('matches the reference with %i hidden units (unrolled and tail paths)', (brainHidden) => {
        for (let seed = 1; seed <= 6; seed++) {
            const world = smallWorld({ brainHidden });
            randomise(world, seed, [1, 4]);
            const expected = [1, 4].map((s) => reference(world, s));
            forwardAll(world);
            [1, 4].forEach((slot, n) => {
                const { hidden: H, outputCount: OUT } = world.layout;
                expect(Array.from(world.hidden.subarray(slot * H, (slot + 1) * H))).toEqual(expected[n].hidden);
                expect(Array.from(world.outputs.subarray(slot * OUT, (slot + 1) * OUT))).toEqual(expected[n].outputs);
            });
        }
    });

    it('lets a pooled value reach an output through the skip block with every hidden weight zero', () => {
        const world = smallWorld();
        randomise(world, 11, [1]);
        const {
            weightCount,
            wIn,
            wRec,
            wOut,
            bOut,
            wSkip,
            bHidden,
            outputCount: OUT,
            geneOutputs: G,
            inputCount,
        } = world.layout;
        const base = weightCount;
        world.weights.fill(0, base + wIn, base + bHidden);
        world.weights.fill(0, base + wOut, base + bOut + G);
        world.weights.fill(0, base + wSkip, base + wSkip + POOLED_VALUES * G);
        world.weights[base + wRec] = 0;
        world.fastOut.fill(0);
        poolRays(world, 1);
        const food = firstPooled(world);
        world.weights[base + wSkip + food * G + 0] = 1.5;
        forwardAll(world);
        const x = world.pooled[inputCount + food];
        expect(world.outputs[OUT + 0]).toBe(Math.fround(detTanh(Math.fround(1.5) * x)));
        expect(world.outputs[OUT + 1]).toBe(0);
        // the skip does not see the body inputs: a weight past the 56 pooled values is not read
        expect(world.layout.wSkip + POOLED_VALUES * G).toBe(world.layout.traitStart);
    });

    it('reads 0 on the SPLIT output, and gene column 8 drives MEMORY_A', () => {
        const world = smallWorld();
        randomise(world, 11, [1]);
        const { weightCount, wIn, bHidden, wOut, bOut, wSkip, geneOutputs: G, outputCount: OUT } = world.layout;
        const base = weightCount;
        world.weights.fill(0, base + wIn, base + bHidden);
        world.weights.fill(0, base + wOut, base + bOut + G);
        world.weights.fill(0, base + wSkip, base + wSkip + POOLED_VALUES * G);
        world.fastOut.fill(0);
        poolRays(world, 1);
        const food = firstPooled(world);
        world.weights[base + wSkip + food * G + 8] = 1.5;
        forwardAll(world);
        const x = world.pooled[world.layout.inputCount + food];
        expect(x).not.toBe(0);
        expect(world.outputs[OUT + OUTPUT_INDEX.SPLIT]).toBe(0);
        expect(world.outputs[OUT + OUTPUT_INDEX.MEMORY_A]).toBe(Math.fround(detTanh(Math.fround(1.5) * x)));
    });

    it('lets the old hidden state change the outputs', () => {
        const a = smallWorld();
        const b = smallWorld();
        randomise(a, 5, [1]);
        randomise(b, 5, [1]);
        b.hidden.fill(0, 3, 6);
        forwardAll(a);
        forwardAll(b);
        const OUT = a.layout.outputCount;
        expect(Array.from(a.outputs.subarray(OUT, 2 * OUT))).not.toEqual(Array.from(b.outputs.subarray(OUT, 2 * OUT)));
    });

    it('treats an input of +0 and -0 identically', () => {
        const a = smallWorld();
        const b = smallWorld();
        randomise(a, 9, [0]);
        randomise(b, 9, [0]);
        a.inputs[0] = 0;
        b.inputs[0] = -0;
        forwardAll(a);
        forwardAll(b);
        expect(Array.from(a.hidden.subarray(0, 3))).toEqual(Array.from(b.hidden.subarray(0, 3)));
        expect(Array.from(a.outputs.subarray(0, 5))).toEqual(Array.from(b.outputs.subarray(0, 5)));
        for (let j = 0; j < 3; j++) {
            expect(Object.is(a.hidden[j], b.hidden[j])).toBe(true);
        }
    });

    it('leaves dead slots untouched', () => {
        const world = smallWorld();
        randomise(world, 3, [1]);
        world.hidden.fill(0.5, 0, 3);
        world.outputs.fill(0.25, 0, 5);
        forwardAll(world);
        expect(Array.from(world.hidden.subarray(0, 3))).toEqual([0.5, 0.5, 0.5]);
        expect(Array.from(world.outputs.subarray(0, 5))).toEqual([0.25, 0.25, 0.25, 0.25, 0.25]);
    });
});

describe('forwardAll contract details', () => {
    it('does not write into the outputs of the next slot', () => {
        const world = smallWorld();
        const { outputCount } = world.layout;
        randomise(world, 3, [0]);
        world.outputs.fill(0.5, outputCount, 2 * outputCount);
        forwardAll(world);
        expect(Array.from(world.outputs.subarray(outputCount, 2 * outputCount))).toEqual(
            new Array(outputCount).fill(0.5),
        );
    });
});
