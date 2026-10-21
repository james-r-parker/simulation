import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { TRAIT_INDEX } from '../../js/sim/brain-layout.js';
import { detSigmoid } from '../../js/sim/det-math.js';
import { HEBB_CLAMP, HEBB_DECAY, hebbianStep } from '../../js/sim/hebbian.js';
import { createRng, nextGaussian } from '../../js/sim/rng.js';
import { applyGenes } from '../../js/sim/traits.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';
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
    applyGenes(world, 1);
    return world;
}

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @returns {number[]} slot 1's genome hidden-to-output block
 */
function genomeBlock(world) {
    const { layout } = world;
    const from = layout.weightCount + layout.wOut;
    return Array.from(world.weights.subarray(from, from + layout.hidden * layout.outputCount));
}

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @returns {number[]} slot 1's plastic block
 */
function plasticBlock(world) {
    const size = world.layout.hidden * world.layout.outputCount;
    return Array.from(world.fastOut.subarray(size, 2 * size));
}

describe('forwardAll with hebbianRate 0', () => {
    it('reads the genome block, never touches fastOut and matches a world whose fastOut is garbage', () => {
        const a = randomWorld({}, 3);
        const b = randomWorld({}, 3);
        b.fastOut.fill(7);
        forwardAll(a);
        forwardAll(b);
        expect(Array.from(b.outputs)).toEqual(Array.from(a.outputs));
        expect(a.fastOut.every((/** @type {number} */ v) => v === 0)).toBe(true);
        expect(genomeBlock(a)).toEqual(genomeBlock(randomWorld({}, 3)));
    });

    it('leaves hashWorld independent of fastOut', () => {
        const a = randomWorld({}, 5);
        const b = randomWorld({}, 5);
        b.fastOut.fill(3);
        expect(hashWorld(b)).toBe(hashWorld(a));
    });
});

describe('forwardAll with hebbianRate above 0', () => {
    it('starts fastOut equal to the genome block and gives the first tick the old outputs', () => {
        const off = randomWorld({}, 9);
        const on = randomWorld({ hebbianRate: 0.05 }, 9);
        expect(plasticBlock(on)).toEqual(genomeBlock(on));
        forwardAll(off);
        forwardAll(on);
        expect(Array.from(on.outputs)).toEqual(Array.from(off.outputs));
    });

    it('moves fastOut by the Hebbian rule with decay and never changes the genome', () => {
        const on = randomWorld({ hebbianRate: 0.05 }, 11);
        const { layout } = on;
        const H = layout.hidden;
        const OUT = layout.outputCount;
        const w = genomeBlock(on);
        forwardAll(on);
        const eta = 0.05 * detSigmoid(on.weights[layout.weightCount + layout.traitStart + TRAIT_INDEX.LEARN]);
        const f = plasticBlock(on);
        for (let j = 0; j < H; j++) {
            for (let o = 0; o < OUT; o++) {
                const i = j * OUT + o;
                const h = on.hidden[H + j];
                const out = on.outputs[OUT + o];
                // fastOut started equal to the genome, so the decay term is 0 on the first step.
                expect(f[i]).toBeCloseTo(w[i] + eta * (h * out), 5);
            }
        }
        expect(genomeBlock(on)).toEqual(w);
    });

    it('decays a displaced weight toward the genome when the unit is silent', () => {
        const on = randomWorld({ hebbianRate: 0.5 }, 13);
        const size = on.layout.hidden * on.layout.outputCount;
        const w = genomeBlock(on);
        on.fastOut.set(
            w.map((v) => v + 1),
            size,
        );
        on.hidden.fill(0, on.layout.hidden, 2 * on.layout.hidden);
        on.outputs.fill(0, on.layout.outputCount, 2 * on.layout.outputCount);
        hebbianStep(on, 1);
        const eta = 0.5 * detSigmoid(on.weights[on.layout.weightCount + on.layout.traitStart + TRAIT_INDEX.LEARN]);
        const f = plasticBlock(on);
        for (let i = 0; i < size; i++) {
            expect(f[i]).toBeCloseTo(w[i] + 1 - eta * HEBB_DECAY, 5);
        }
    });

    it('clamps the plastic weights to plus or minus HEBB_CLAMP', () => {
        const on = randomWorld({ hebbianRate: 1 }, 15);
        const size = on.layout.hidden * on.layout.outputCount;
        on.weights[on.layout.weightCount + on.layout.traitStart + TRAIT_INDEX.LEARN] = 40;
        on.fastOut.fill(HEBB_CLAMP, size, 2 * size);
        on.hidden.fill(1, on.layout.hidden, 2 * on.layout.hidden);
        on.outputs.fill(1, on.layout.outputCount, 2 * on.layout.outputCount);
        for (let t = 0; t < 20; t++) {
            hebbianStep(on, 1);
        }
        expect(plasticBlock(on).every((v) => v <= HEBB_CLAMP)).toBe(true);
        on.fastOut.fill(-HEBB_CLAMP, size, 2 * size);
        on.outputs.fill(-1, on.layout.outputCount, 2 * on.layout.outputCount);
        for (let t = 0; t < 20; t++) {
            hebbianStep(on, 1);
        }
        expect(plasticBlock(on).every((v) => v >= -HEBB_CLAMP)).toBe(true);
    });

    it('includes fastOut in hashWorld', () => {
        const a = randomWorld({ hebbianRate: 0.05 }, 17);
        const b = randomWorld({ hebbianRate: 0.05 }, 17);
        b.fastOut[a.layout.hidden * a.layout.outputCount] += 1;
        expect(hashWorld(b)).not.toBe(hashWorld(a));
    });
});

describe('fastOut across births and slot reuse', () => {
    it('gives a child the genome block, not what its mother learned', () => {
        const w = lifeWorld({ hebbianRate: 0.05, splitMinEnergy: 500 });
        const mother = addBlob(w, { energy: 900 });
        const size = w.layout.hidden * w.layout.outputCount;
        w.weights.fill(0.25, mother * w.layout.weightCount, (mother + 1) * w.layout.weightCount);
        applyGenes(w, mother);
        w.fastOut.fill(2.5, mother * size, (mother + 1) * size);
        splitAll(w, recordingPolicy([]));
        const child = 1;
        expect(w.alive[child]).toBe(1);
        const from = child * w.layout.weightCount + w.layout.wOut;
        expect(Array.from(w.fastOut.subarray(child * size, (child + 1) * size))).toEqual(
            Array.from(w.weights.subarray(from, from + size)),
        );
        expect(w.fastOut[mother * size]).toBe(2.5);
    });

    it('zeroes fastOut when a slot is freed and re-copies the genome when the slot is reused', () => {
        const w = lifeWorld({ hebbianRate: 0.05, splitMinEnergy: 500 });
        const mother = addBlob(w, { energy: 900 });
        const size = w.layout.hidden * w.layout.outputCount;
        w.weights.fill(0.5, mother * w.layout.weightCount, (mother + 1) * w.layout.weightCount);
        applyGenes(w, mother);
        w.fastOut.fill(3, mother * size, (mother + 1) * size);
        freeAgent(w, mother);
        expect(w.fastOut.subarray(mother * size, (mother + 1) * size).every((/** @type {number} */ v) => v === 0)).toBe(
            true,
        );
        const reborn = addBlob(w, { energy: 900 });
        expect(reborn).toBe(mother);
        w.weights.fill(-0.5, reborn * w.layout.weightCount, (reborn + 1) * w.layout.weightCount);
        applyGenes(w, reborn);
        expect(
            w.fastOut.subarray(reborn * size, (reborn + 1) * size).every((/** @type {number} */ v) => v === -0.5),
        ).toBe(true);
    });
});
