import { describe, expect, it } from 'vitest';
import { crossNeurons } from '../../js/evo/crossover.js';
import { POOLED_VALUES, TRAIT_GENES, brainLayout } from '../../js/sim/brain-layout.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';

const layout = brainLayout({ rayCount: 2, brainHidden: 12 });
const H = layout.hidden;
const OUT = layout.geneOutputs; // gene columns: the outputs but SPLIT

/**
 * @param {number} seed the stream seed
 * @returns {Float32Array} the child of an all-1 mother and an all-(-1) father
 */
function cross(seed) {
    const child = new Float32Array(layout.weightCount);
    const mother = new Float32Array(layout.weightCount).fill(1);
    const father = new Float32Array(layout.weightCount).fill(-1);
    crossNeurons(child, mother, father, { layout, rng: createRng(seed) });
    return child;
}

/**
 * @param {Float32Array} child the child row
 * @param {number} h the hidden neuron
 * @returns {number[]} every value in neuron h's block
 */
function block(child, h) {
    const values = [child[layout.bHidden + h], child[layout.leakStart + h]];
    for (let i = 0; i < layout.inputCount; i++) {
        values.push(child[layout.wIn + i * H + h]);
    }
    for (let k = 0; k < H; k++) {
        values.push(child[layout.wRec + k * H + h]);
    }
    for (let o = 0; o < OUT; o++) {
        values.push(child[layout.wOut + h * OUT + o]);
    }
    return values;
}

describe('crossNeurons', () => {
    it('takes every neuron block whole from one parent, and both parents appear', () => {
        const sources = new Set();
        for (let seed = 1; seed <= 5; seed++) {
            const child = cross(seed);
            for (let h = 0; h < H; h++) {
                const values = block(child, h);
                expect(new Set(values).size).toBe(1);
                sources.add(values[0]);
            }
        }
        expect([...sources].sort()).toEqual([-1, 1]);
    });

    it('takes bOut from the mother', () => {
        for (let seed = 1; seed <= 5; seed++) {
            expect(
                cross(seed)
                    .subarray(layout.bOut, layout.wSkip)
                    .every((w) => w === 1),
            ).toBe(true);
        }
    });

    it('takes each trait gene whole from one parent with one draw per gene, after the neurons', () => {
        const seen = new Set();
        for (let seed = 1; seed <= 8; seed++) {
            const child = cross(seed);
            const rng = createRng(seed);
            for (let h = 0; h < H; h++) {
                nextFloat(rng);
            }
            for (let t = 0; t < TRAIT_GENES; t++) {
                const expected = nextFloat(rng) < 0.5 ? 1 : -1;
                expect(child[layout.traitStart + t]).toBe(expected);
                seen.add(expected);
            }
        }
        expect([...seen].sort()).toEqual([-1, 1]);
    });

    it("takes each output's skip column whole from one parent, one draw per output, after the trait genes", () => {
        const seen = new Set();
        for (let seed = 1; seed <= 8; seed++) {
            const child = cross(seed);
            const rng = createRng(seed);
            for (let n = 0; n < H + TRAIT_GENES; n++) {
                nextFloat(rng);
            }
            for (let o = 0; o < OUT; o++) {
                const expected = nextFloat(rng) < 0.5 ? 1 : -1;
                for (let i = 0; i < POOLED_VALUES; i++) {
                    expect(child[layout.wSkip + i * OUT + o]).toBe(expected);
                }
                seen.add(expected);
            }
        }
        expect([...seen].sort()).toEqual([-1, 1]);
    });

    it('moves leak gene h with neuron h (the block test above includes it)', () => {
        const child = cross(2);
        for (let h = 0; h < H; h++) {
            expect(child[layout.leakStart + h]).toBe(child[layout.bHidden + h]);
        }
    });

    it('writes every weight of the row', () => {
        expect(cross(3).every((w) => w === 1 || w === -1)).toBe(true);
    });

    it('chooses each neuron with probability near one half', () => {
        let mothers = 0;
        for (let seed = 1; seed <= 100; seed++) {
            const child = cross(seed);
            for (let h = 0; h < H; h++) {
                mothers += child[layout.bHidden + h] === 1 ? 1 : 0;
            }
        }
        expect(mothers / (100 * H)).toBeGreaterThan(0.45);
        expect(mothers / (100 * H)).toBeLessThan(0.55);
    });

    it('is deterministic per stream and differs across streams', () => {
        expect(cross(8)).toEqual(cross(8));
        expect(cross(8)).not.toEqual(cross(9));
    });
});
