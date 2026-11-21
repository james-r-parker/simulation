import { describe, expect, it } from 'vitest';
import { crossTraits, inheritTraits, mutateTraits } from '../../js/evo/trait-inherit.js';
import { TRAITS } from '../../js/sim/body-traits.js';
import { TRAIT_SLOTS, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, nextFloat, nextGaussian } from '../../js/sim/rng.js';

const layout = brainLayout({ rayCount: 2, brainHidden: 12 });
const config = createConfig();
const START = layout.traitStart;

/**
 * @param {number} fill the value of every gene
 * @returns {Float32Array} a row
 */
const row = (fill) => new Float32Array(layout.weightCount).fill(fill);

/** @returns {Float32Array} a parent pair's child, from all-1 and all-(-1) rows, with every trait `either` */
function crossed(/** @type {number} */ seed, /** @type {any} */ traits = TRAITS) {
    const child = row(0);
    crossTraits(child, row(1), row(-1), { layout, rng: createRng(seed), traits });
    return child;
}

describe('crossTraits', () => {
    it('takes each trait gene whole from one parent, one nextFloat per slot in index order', () => {
        const seen = new Set();
        for (let seed = 1; seed <= 8; seed++) {
            const child = crossed(seed);
            const rng = createRng(seed);
            for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
                const expected = nextFloat(rng) < 0.5 ? 1 : -1;
                expect(child[START + slot]).toBe(expected);
                seen.add(expected);
            }
        }
        expect([...seen].sort()).toEqual([-1, 1]);
    });

    it('averages a blend trait and draws nothing for it, so the next slot reads the next float', () => {
        const blend = TRAITS.map((trait) => (trait.index === 2 ? { ...trait, inherit: 'blend' } : trait));
        const child = crossed(3, blend);
        expect(child[START + 2]).toBe(0);
        const rng = createRng(3);
        for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
            if (slot !== 2) {
                expect(child[START + slot]).toBe(nextFloat(rng) < 0.5 ? 1 : -1);
            }
        }
    });

    it('writes only the trait block', () => {
        const child = row(7);
        crossTraits(child, row(1), row(-1), { layout, rng: createRng(2) });
        expect(child.subarray(0, START).every((w) => w === 7)).toBe(true);
        expect(child.subarray(START + TRAIT_SLOTS).every((w) => w === 7)).toBe(true);
    });
});

describe('mutateTraits', () => {
    it('adds traitMutationSigma x nextGaussian per slot at rate 1, drawing in slot order', () => {
        const genes = row(0.5);
        mutateTraits(genes, layout, createRng(4), { config });
        const rng = createRng(4);
        for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
            expect(genes[START + slot]).toBe(Math.fround(0.5 + config.traitMutationSigma * nextGaussian(rng)));
        }
        expect(genes.subarray(0, START).every((w) => w === 0.5)).toBe(true);
    });

    it('scales the step by the trait sigmaScale and leaves a spare slot at 1', () => {
        const scaled = TRAITS.map((trait) => (trait.index === 5 ? { ...trait, sigmaScale: 3 } : trait));
        const genes = row(0);
        mutateTraits(genes, layout, createRng(5), { config, traits: scaled });
        const rng = createRng(5);
        for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
            const scale = slot === 5 ? 3 : 1;
            expect(genes[START + slot]).toBe(Math.fround(config.traitMutationSigma * scale * nextGaussian(rng)));
        }
    });

    it('below rate 1 draws one nextFloat per slot and skips the gene at or above the rate', () => {
        const genes = row(0);
        mutateTraits(genes, layout, createRng(6), { config, rate: 0.4 });
        const rng = createRng(6);
        for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
            const moved = nextFloat(rng) < 0.4;
            const expected = moved ? Math.fround(config.traitMutationSigma * nextGaussian(rng)) : 0;
            expect(genes[START + slot]).toBe(expected);
        }
    });

    it('clamps a gene to plus or minus traitGeneClamp', () => {
        const high = row(config.traitGeneClamp);
        const low = row(-config.traitGeneClamp);
        mutateTraits(high, layout, createRng(7), { config: { ...config, traitMutationSigma: 5 } });
        mutateTraits(low, layout, createRng(7), { config: { ...config, traitMutationSigma: 5 } });
        expect(Math.max(...high.subarray(START, START + TRAIT_SLOTS))).toBe(3);
        expect(Math.min(...low.subarray(START, START + TRAIT_SLOTS))).toBe(-3);
    });
});

describe('inheritTraits', () => {
    it('crosses, then mutates, on the one stream', () => {
        const child = row(0);
        inheritTraits(child, row(1), row(-1), { layout, rng: createRng(8), config });
        const expected = row(0);
        const rng = createRng(8);
        crossTraits(expected, row(1), row(-1), { layout, rng });
        mutateTraits(expected, layout, rng, { config });
        expect(Array.from(child)).toEqual(Array.from(expected));
    });

    it('keeps the defaults of the two keys', () => {
        expect([config.traitMutationSigma, config.traitGeneClamp]).toEqual([0.1, 3]);
    });
});
