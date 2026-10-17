import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { BODY_INPUT, OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { applyGenes } from '../../js/sim/traits.js';
import { createRng, nextGaussian } from '../../js/sim/rng.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {Record<string, any>} over config overrides
 * @param {number} seed the seed
 * @returns {ReturnType<typeof smallWorld>} a world with slot 1 alive, random weights, inputs and hidden state
 */
function randomWorld(over, seed) {
    const world = smallWorld(over);
    const rng = createRng(seed);
    const { layout } = world;
    world.alive[1] = 1;
    for (let i = 0; i < layout.weightCount; i++) {
        world.weights[layout.weightCount + i] = nextGaussian(rng);
    }
    for (let i = 0; i < layout.inputCount; i++) {
        world.inputs[layout.inputCount + i] = nextGaussian(rng);
    }
    for (let j = 0; j < layout.hidden; j++) {
        world.hidden[layout.hidden + j] = Math.tanh(nextGaussian(rng));
    }
    return world;
}

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @returns {number[]} slot 1's hidden row then its outputs
 */
function state(world) {
    const { hidden: H, outputCount: OUT } = world.layout;
    return [...world.hidden.subarray(H, 2 * H), ...world.outputs.subarray(OUT, 2 * OUT)];
}

describe('forwardAll with leaky hidden units', () => {
    it('ignores the leak genes and leakRate when leakEnabled is false', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const a = randomWorld({}, seed);
            const b = randomWorld({}, seed);
            b.weights.fill(-5, b.layout.weightCount + b.layout.leakStart, 2 * b.layout.weightCount);
            b.leakRate.fill(0.3);
            forwardAll(a);
            forwardAll(b);
            expect(state(b)).toEqual(state(a));
        }
    });

    it('takes the new value whole at a leak rate of 1, bit for bit like the old rule', () => {
        const off = randomWorld({}, 4);
        const on = randomWorld({ leakEnabled: true }, 4);
        on.leakRate.fill(1);
        forwardAll(off);
        forwardAll(on);
        expect(state(on)).toEqual(state(off));
    });

    it('blends the old and new hidden values by the leak rate', () => {
        const off = randomWorld({}, 6);
        const on = randomWorld({ leakEnabled: true }, 6);
        const H = on.layout.hidden;
        const old = Array.from(on.hidden.subarray(H, 2 * H));
        on.leakRate.fill(0.25);
        forwardAll(off);
        forwardAll(on);
        for (let j = 0; j < H; j++) {
            const target = off.hidden[H + j];
            expect(on.hidden[H + j]).toBeCloseTo(0.75 * old[j] + 0.25 * target, 6);
        }
    });

    it('derives its rates from the genes through applyGenes, and a unit with a low gene moves slowly', () => {
        const world = randomWorld({ leakEnabled: true }, 8);
        const { layout } = world;
        world.weights.fill(-40, layout.weightCount + layout.leakStart, 2 * layout.weightCount);
        applyGenes(world, 1);
        const old = Array.from(world.hidden.subarray(layout.hidden, 2 * layout.hidden));
        forwardAll(world);
        for (let j = 0; j < layout.hidden; j++) {
            expect(Math.abs(world.hidden[layout.hidden + j] - old[j])).toBeLessThanOrEqual(0.1);
        }
    });

    it('keeps 95% of its old value at a leak rate of 0.05', () => {
        const off = randomWorld({}, 12);
        const on = randomWorld({ leakEnabled: true }, 12);
        const H = on.layout.hidden;
        const old = Array.from(on.hidden.subarray(H, 2 * H));
        on.leakRate.fill(0.05);
        forwardAll(off);
        forwardAll(on);
        for (let j = 0; j < H; j++) {
            expect(on.hidden[H + j]).toBeCloseTo(0.95 * old[j] + 0.05 * off.hidden[H + j], 6);
        }
    });

    it('reads the memory outputs back as body inputs 33 and 34 on the next tick, only with the leak on', () => {
        for (const leakEnabled of [true, false]) {
            const world = randomWorld({ leakEnabled }, 14);
            world.leakRate.fill(1);
            forwardAll(world);
            writeBodyInputs(world, 1);
            const base = world.layout.inputCount + world.config.rayCount * RAY_CHANNELS;
            const a = world.outputs[OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A];
            const b = world.outputs[OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_B];
            expect(world.inputs[base + BODY_INPUT.MEMORY_A]).toBe(leakEnabled ? a : 0);
            expect(world.inputs[base + BODY_INPUT.MEMORY_B]).toBe(leakEnabled ? b : 0);
        }
    });
});
