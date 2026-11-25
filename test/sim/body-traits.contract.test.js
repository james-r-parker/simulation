// One suite over every registry entry (docs/designs/body-genes.md, "The contract tests"): a new trait is covered by
// adding its entry.

import { describe, expect, it } from 'vitest';
import { crossTraits, mutateTraits } from '../../js/evo/trait-inherit.js';
import { LANES } from '../../js/sim/body-lanes.js';
import { MAX_OFFSET_SPAN, MAX_TRAIT_SPAN, TRAITS, maxSpanOf, traitRatio } from '../../js/sim/body-traits.js';
import { TRAIT_INDEX, TRAIT_SLOTS, brainLayout } from '../../js/sim/brain-layout.js';
import { createPreStep5Config } from '../helpers/pre-step5.js';
import { createRng } from '../../js/sim/rng.js';
import { rebuild, setGene, setSpan, traitWorld } from './helpers/trait-world.js';

const BIRTHS = 10000;
const config = createPreStep5Config();
const layout = brainLayout({ rayCount: 2, brainHidden: 4 });

/**
 * Runs `BIRTHS` mutations of an all-0 trait block and keeps every slot's step.
 * @param {readonly any[]} traits the registry
 * @returns {Float64Array[]} per slot, the gene after each birth
 */
function steps(traits) {
    const out = Array.from({ length: TRAIT_SLOTS }, () => new Float64Array(BIRTHS));
    const rng = createRng(11);
    const row = new Float32Array(layout.weightCount);
    for (let birth = 0; birth < BIRTHS; birth++) {
        row.fill(0);
        mutateTraits(row, layout, rng, { config, traits });
        for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
            out[slot][birth] = row[layout.traitStart + slot];
        }
    }
    return out;
}

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
            // A cost lane at a base of 0 (sprintHeat, fatSlowShare by default) has nothing to scale: give it a base of 1.
            const laneBases = Float64Array.from(world.laneBases);
            const at0 = world.spec[slot] * LANES.length + LANES.findIndex((candidate) => candidate.name === lane);
            laneBases[at0] = laneBases[at0] === 0 ? 1 : laneBases[at0];
            const priced = /** @type {Record<string, any>} */ ({
                ...world,
                laneBases,
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

describe.each(
    /** @type {[string, any][]} */ ([
        ['as registered', TRAITS],
        ['with every trait blended and scaled by 2', TRAITS.map((t) => ({ ...t, inherit: 'blend', sigmaScale: 2 }))],
    ]),
)('inheritance, %s', (_, traits) => {
    const parents = () => {
        const mother = new Float32Array(layout.weightCount).map((__, i) => Math.fround(Math.sin(i + 1)));
        const father = new Float32Array(layout.weightCount).map((__, i) => Math.fround(Math.cos(i * 2 + 1)));
        return { mother, father };
    };

    it.each(TRAITS.map((trait) => [trait.name, trait.index]))(
        'gives a child of %s one parent gene (either) or their mean (blend) before mutation',
        (_name, index) => {
            const { mother, father } = parents();
            const child = new Float32Array(layout.weightCount);
            const at = layout.traitStart + index;
            const kinds = new Set();
            for (let seed = 1; seed <= 16; seed++) {
                crossTraits(child, mother, father, { layout, rng: createRng(seed), traits });
                const blend = traits.find((/** @type {any} */ t) => t.index === index).inherit === 'blend';
                const mean = Math.fround((mother[at] + father[at]) / 2);
                const either = child[at] === mother[at] || child[at] === father[at];
                expect(blend ? child[at] === mean : either, `seed ${seed}`).toBe(true);
                kinds.add(child[at]);
            }
            expect(kinds.size).toBe(
                traits.find((/** @type {any} */ t) => t.index === index).inherit === 'blend' ? 1 : 2,
            );
        },
    );

    const all = steps(traits);

    it.each(TRAITS.map((trait) => [trait.name, trait.index]))(
        'steps %s by traitMutationSigma x sigmaScale, within 5%, and never leaves the clamp',
        (_name, index) => {
            const sigma =
                config.traitMutationSigma * traits.find((/** @type {any} */ t) => t.index === index).sigmaScale;
            const values = all[index];
            const mean = values.reduce((a, b) => a + b, 0) / BIRTHS;
            const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / BIRTHS);
            expect(sd / sigma).toBeGreaterThan(0.95);
            expect(sd / sigma).toBeLessThan(1.05);
            const row = new Float32Array(layout.weightCount).fill(config.traitGeneClamp);
            mutateTraits(row, layout, createRng(index + 1), { config: { ...config, traitMutationSigma: 9 }, traits });
            const gene = row[layout.traitStart + index];
            expect(Math.abs(gene)).toBeLessThanOrEqual(config.traitGeneClamp);
        },
    );
});
