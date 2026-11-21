// One suite over every registry entry (docs/designs/body-genes.md, "The contract tests"): a new trait is covered by
// adding its entry. The inheritance rows are in T33 (the inheritance rows).

import { describe, expect, it } from 'vitest';
import { LANES } from '../../js/sim/body-lanes.js';
import { MAX_OFFSET_SPAN, MAX_TRAIT_SPAN, TRAITS, maxSpanOf, traitRatio } from '../../js/sim/body-traits.js';
import { TRAIT_INDEX, TRAIT_SLOTS } from '../../js/sim/brain-layout.js';
import { rebuild, setGene, setSpan, traitWorld } from './helpers/trait-world.js';

const GENES = [-50, -3, -1, -0.2, 0, 0.2, 1, 3, 50];

/**
 * @param {Record<string, any>} world a world
 * @param {number} slot a slot
 * @returns {Record<string, number>} every lane of the slot
 */
function lanesOf(world, slot) {
    return Object.fromEntries(LANES.map((lane) => [lane.name, world.lanes[lane.name][slot]]));
}

/**
 * The lane the way "The lane catalogue" states it, as a loop over the registry: the base times each ratio to its
 * power, and the sum of the shifts for a threshold.
 * @param {Record<string, any>} world a world
 * @param {number} slot a slot
 * @param {Record<string, number>} base the lane bases
 * @returns {Record<string, number>} every lane
 */
function naive(world, slot, base) {
    const out = { ...base };
    for (const trait of TRAITS) {
        const span = world.traitSpans[world.spec[slot] * TRAIT_SLOTS + trait.index];
        const gene = world.weights[slot * world.layout.weightCount + world.layout.traitStart + trait.index];
        const r = trait.kind === 'ratio' ? 1 + span * Math.tanh(gene) : span * Math.tanh(gene);
        for (const { lane, power } of trait.effects) {
            out[lane] = trait.kind === 'offset' ? out[lane] + r * power : out[lane] * Math.pow(r, power);
        }
    }
    return out;
}

describe('the registry', () => {
    it('lists the eighteen traits at the indices of TRAIT_INDEX, inside the 24 slots', () => {
        expect(TRAITS).toHaveLength(18);
        expect(TRAIT_SLOTS).toBe(24);
        const upper = (/** @type {string} */ name) => name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
        for (const trait of TRAITS) {
            expect(TRAIT_INDEX[/** @type {keyof typeof TRAIT_INDEX} */ (upper(trait.name))], trait.name).toBe(
                trait.index,
            );
        }
        expect(TRAITS.map((trait) => trait.index)).toEqual([...Array(18).keys()]);
    });

    it.each(TRAITS.map((trait) => [trait.name, trait]))('%s names real lanes with a power of 1 or -1', (_, trait) => {
        const names = LANES.map((lane) => lane.name);
        for (const { lane, power } of [...trait.effects, ...trait.costs.map((cost) => ({ ...cost, power: 1 }))]) {
            expect(names, lane).toContain(lane);
            expect(Math.abs(power)).toBe(1);
        }
        expect(trait.describe).not.toBe('');
        expect(['either', 'blend']).toContain(trait.inherit);
    });

    it('shifts only the six thresholds with the offset trait, and no lane with the raw trait', () => {
        expect(TRAITS.filter((trait) => trait.kind === 'offset').map((trait) => trait.name)).toEqual(['heatBand']);
        expect(TRAITS.filter((trait) => trait.kind === 'raw').map((trait) => trait.name)).toEqual(['learn']);
        for (const trait of TRAITS) {
            const offsets = trait.effects.filter(
                (effect) => LANES.find((lane) => lane.name === effect.lane)?.kind === 'offset',
            );
            expect(offsets.length === 0 || trait.kind === 'offset', trait.name).toBe(true);
        }
    });
});

describe.each(TRAITS.map((trait) => [trait.name, trait]))('trait %s', (_, trait) => {
    const top = Math.min(maxSpanOf(trait), trait.kind === 'offset' ? 8 : 0.4);

    it('is neutral: a gene of 0, or a span of 0 with any gene, leaves every lane at its base', () => {
        const { world, slot } = traitWorld();
        rebuild(world, slot);
        const base = lanesOf(world, slot);
        setSpan(world, slot, trait.index, top);
        setGene(world, slot, trait.index, 0);
        rebuild(world, slot);
        expect(lanesOf(world, slot)).toEqual(base);
        setSpan(world, slot, trait.index, 0);
        for (const gene of GENES) {
            setGene(world, slot, trait.index, gene);
            rebuild(world, slot);
            expect(lanesOf(world, slot), `gene ${gene}`).toEqual(base);
        }
    });

    it('is bounded by its span and rises with the gene', () => {
        let last = -Infinity;
        for (const gene of GENES) {
            const value = traitRatio(trait, gene, top);
            const centre = trait.kind === 'offset' ? 0 : 1;
            expect(Math.abs(value - centre)).toBeLessThanOrEqual(trait.kind === 'raw' ? 0 : top);
            expect(value).toBeGreaterThanOrEqual(last);
            last = value;
        }
    });

    it('moves each cost lane with the gene by its sign, when its exponent is above 0', () => {
        const { world, slot } = traitWorld();
        setSpan(world, slot, trait.index, top);
        for (const { lane, exponentKey, sign } of trait.costs) {
            const priced = /** @type {Record<string, any>} */ ({
                ...world,
                config: { ...world.config, [exponentKey]: 1 },
            });
            const at = (/** @type {number} */ gene) => {
                setGene(priced, slot, trait.index, gene);
                rebuild(priced, slot);
                return priced.lanes[lane][slot];
            };
            const [low, high] = [at(-1), at(1)];
            expect(Math.sign(high - low), `${lane} by ${exponentKey}`).toBe(sign);
        }
    });
});

describe('composition', () => {
    it('gives a lane the base times every ratio that names it, against a naive loop', () => {
        const { world, slot } = traitWorld(1);
        rebuild(world, slot);
        const base = lanesOf(world, slot);
        TRAITS.forEach((trait, i) => {
            setSpan(world, slot, trait.index, trait.kind === 'offset' ? 6 : 0.1 + (i % 4) * 0.1);
            setGene(world, slot, trait.index, ((i % 7) - 3) * 0.45);
        });
        rebuild(world, slot);
        const expected = naive(world, slot, base);
        const lanes = lanesOf(world, slot);
        for (const lane of LANES) {
            expect(lanes[lane.name], lane.name).toBeCloseTo(expected[lane.name], 9);
        }
        const named = (/** @type {string} */ name) =>
            TRAITS.filter((trait) => trait.effects.some((effect) => effect.lane === name)).length;
        expect(named('visionRange')).toBeGreaterThanOrEqual(2);
        expect(lanes.visionRange).not.toBe(base.visionRange);
    });

    it('keeps the span bounds of the doc', () => {
        expect(MAX_TRAIT_SPAN).toBe(0.5);
        expect(MAX_OFFSET_SPAN).toBeGreaterThanOrEqual(8);
    });
});
