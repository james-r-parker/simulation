import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { detTanh } from '../../js/sim/det-math.js';
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
        const { weightCount, inputCount, hidden, outputCount } = world.layout;
        for (let i = 0; i < weightCount; i++) {
            world.weights[slot * weightCount + i] = nextGaussian(rng);
        }
        for (let i = 0; i < inputCount; i++) {
            const r = nextFloat(rng);
            world.inputs[slot * inputCount + i] = r < 0.5 ? 0 : r < 0.6 ? -0 : nextGaussian(rng);
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
    const { weightCount, inputCount, hidden: H, outputCount: OUT, wIn, wRec, bHidden, wOut, bOut } = world.layout;
    const w = (/** @type {number} */ i) => world.weights[slot * weightCount + i];
    const next = [];
    for (let j = 0; j < H; j++) {
        let sum = w(bHidden + j);
        for (let i = 0; i < inputCount; i++) {
            const x = world.inputs[slot * inputCount + i];
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
        let sum = w(bOut + o);
        for (let j = 0; j < H; j++) {
            sum += w(wOut + j * OUT + o) * next[j];
        }
        outputs.push(Math.fround(detTanh(sum)));
    }
    return { outputs, hidden: next };
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
    it('keeps the sign of a negative-zero bias when every input and hidden product is -0 or skipped', () => {
        const world = smallWorld();
        const { weightCount, inputCount, hidden, wIn, wRec, bHidden } = world.layout;
        world.alive[0] = 1;
        world.weights.fill(0, 0, weightCount);
        world.weights.fill(1, wIn, wIn + inputCount * hidden);
        world.weights.fill(-1, wRec, wRec + hidden * hidden);
        world.weights.fill(-0, bHidden, bHidden + hidden);
        forwardAll(world);
        for (let j = 0; j < hidden; j++) {
            expect(Object.is(world.hidden[j], -0)).toBe(true);
        }
    });

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
