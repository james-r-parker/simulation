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
    world.leakRate.fill(1); // the plain tanh rule; tests lower it
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

describe('forwardAll with leaky hidden units', () => {
    it('blends the old and new hidden values by the leak rate', () => {
        const off = randomWorld({}, 6);
        const on = randomWorld({}, 6);
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
        const world = randomWorld({}, 8);
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
        const on = randomWorld({}, 12);
        const H = on.layout.hidden;
        const old = Array.from(on.hidden.subarray(H, 2 * H));
        on.leakRate.fill(0.05);
        forwardAll(off);
        forwardAll(on);
        for (let j = 0; j < H; j++) {
            expect(on.hidden[H + j]).toBeCloseTo(0.95 * old[j] + 0.05 * off.hidden[H + j], 6);
        }
    });

    it('reads the memory outputs back as body inputs 33 and 34 on the next tick', () => {
        const world = randomWorld({}, 14);
        forwardAll(world);
        writeBodyInputs(world, 1);
        const base = world.layout.inputCount + world.config.rayCount * RAY_CHANNELS;
        expect(world.inputs[base + BODY_INPUT.MEMORY_A]).toBe(world.outputs[OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A]);
        expect(world.inputs[base + BODY_INPUT.MEMORY_B]).toBe(world.outputs[OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_B]);
    });
});

describe('the leaky update against the per-unit rule', () => {
    it('takes the plain tanh whole at rate 1 and blends below it, with saturated and zero pre-activations', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const off = randomWorld({}, seed);
            const on = randomWorld({}, seed);
            const { layout } = on;
            const H = layout.hidden;
            for (const world of [off, on]) {
                const row = layout.weightCount;
                for (let i = 0; i < layout.weightCount; i++) {
                    world.weights[row + i] = on.weights[row + i] * (seed % 2 === 0 ? 40 : 1);
                }
                world.weights.fill(0, row + layout.bHidden, row + layout.bHidden + 3);
            }
            for (let j = 0; j < H; j++) {
                on.leakRate[H + j] = j % 2 === 0 ? 1 : 0.05 + (0.9 * j) / H;
            }
            const old = Array.from(on.hidden.subarray(H, 2 * H));
            forwardAll(off);
            forwardAll(on);
            for (let j = 0; j < H; j++) {
                const a = on.leakRate[H + j];
                const blend = (1 - a) * old[j] + a * off.hidden[H + j];
                if (a === 1) {
                    expect(on.hidden[H + j]).toBe(off.hidden[H + j]); // the plain tanh, bit for bit
                } else {
                    expect(on.hidden[H + j]).toBeCloseTo(blend, 6);
                }
            }
        }
    });
});
