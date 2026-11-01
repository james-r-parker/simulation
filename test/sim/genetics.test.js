import { describe, expect, it } from 'vitest';
import { SIMILARITY_DIMS, geneticDistance } from '../../js/sim/genetics.js';
import { randomWeights } from '../../js/evo/mutation.js';
import { createRng } from '../../js/sim/rng.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

/**
 * The distance written out without the cache: sample k is index (k x 7919) mod traitStart.
 * @param {any} w the world
 * @param {number} a slot
 * @param {number} b slot
 * @returns {number}
 */
function naive(w, a, b) {
    const l = w.layout;
    let sum = 0;
    for (let k = 0; k < 64; k++) {
        const i = (k * 7919) % l.traitStart;
        let sd = 1 / Math.sqrt(l.hidden);
        if (i < l.bHidden) {
            sd = 1 / Math.sqrt(l.inputCount + l.hidden);
        } else if (i >= l.wSkip) {
            sd = 1 / Math.sqrt(56);
        }
        sum += Math.abs(w.weights[a * l.weightCount + i] - w.weights[b * l.weightCount + i]) / sd;
    }
    return sum / 64;
}

/**
 * @param {number} count agents
 * @returns {any} a world whose agents hold random brains
 */
function randomWorld(count) {
    const w = lifeWorld({ maxAgents: Math.max(8, count) });
    const rng = createRng(7);
    for (let s = 0; s < count; s++) {
        addBlob(w);
        randomWeights(w.weights.subarray(s * w.layout.weightCount, (s + 1) * w.layout.weightCount), w.layout, rng, 3);
    }
    return w;
}

describe('geneticDistance', () => {
    it('samples 64 indices', () => {
        expect(SIMILARITY_DIMS).toBe(64);
    });

    it('is 0 for clones and for an agent against itself', () => {
        const w = randomWorld(2);
        const n = w.layout.weightCount;
        w.weights.copyWithin(n, 0, n);
        expect(geneticDistance(w, 0, 1)).toBe(0);
        expect(geneticDistance(w, 0, 0)).toBe(0);
    });

    it('is symmetric and matches the naive reference', () => {
        const w = randomWorld(6);
        for (let a = 0; a < 6; a++) {
            for (let b = 0; b < 6; b++) {
                expect(geneticDistance(w, a, b)).toBe(geneticDistance(w, b, a));
                expect(geneticDistance(w, a, b)).toBeCloseTo(naive(w, a, b), 9);
            }
        }
    });

    it('is about 1.13 between unrelated random genomes', () => {
        const w = randomWorld(40);
        let sum = 0;
        for (let a = 0; a < 40; a += 2) {
            sum += geneticDistance(w, a, a + 1);
        }
        expect(sum / 20).toBeGreaterThan(0.95);
        expect(sum / 20).toBeLessThan(1.3);
    });

    it('reads only the sampled weights, not the trait or leak genes', () => {
        const w = randomWorld(2);
        const l = w.layout;
        w.weights.copyWithin(l.weightCount, 0, l.weightCount);
        w.weights.fill(3, l.weightCount + l.traitStart, 2 * l.weightCount);
        expect(geneticDistance(w, 0, 1)).toBe(0);
        w.weights[l.weightCount] += 1; // index 0 is sample k = 0
        expect(geneticDistance(w, 0, 1)).toBeGreaterThan(0);
    });
});
