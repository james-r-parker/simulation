import { describe, expect, it } from 'vitest';
import { laneBases } from '../../js/sim/body-lanes.js';
import {
    EXISTING_SPAN,
    MAX_OFFSET_SPAN,
    MAX_TRAIT_SPAN,
    TRAITS,
    geneMenuProblem,
    maxSpanOf,
    spanTable,
    traitRatio,
} from '../../js/sim/body-traits.js';
import { TRAIT_INDEX, TRAIT_SLOTS } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { SPEC_COUNT, SPEC_NAMES } from '../../js/sim/specs.js';
import { TRAIT_SPAN, applyGenes, traitValue } from '../../js/sim/traits.js';
import { rebuild, setGene, setSpan, traitWorld } from './helpers/trait-world.js';

const trait = (/** @type {string} */ name) => /** @type {any} */ (TRAITS.find((candidate) => candidate.name === name));

describe('traitRatio', () => {
    it('is 1 plus span x tanh(gene) for a ratio, the shift for an offset and 1 for a raw trait', () => {
        expect(traitRatio(trait('speed'), 0.5, 0.2)).toBeCloseTo(1 + 0.2 * Math.tanh(0.5), 12);
        expect(traitRatio(trait('heatBand'), -1, 8)).toBeCloseTo(8 * Math.tanh(-1), 12);
        expect(traitRatio(trait('learn'), 2, 0.3)).toBe(1);
    });

    it('matches traitValue for the four traits read today', () => {
        expect(EXISTING_SPAN).toBe(TRAIT_SPAN);
        for (const name of ['size', 'vision', 'childShare']) {
            expect(traitRatio(trait(name), 0.7, EXISTING_SPAN)).toBe(traitValue(0.7));
        }
    });
});

describe('the default menus', () => {
    const config = createConfig();

    it('hold every trait of the registry, the four read today at 0.3 and the rest at 0', () => {
        for (const name of SPEC_NAMES) {
            const genes = config.specialisations[name].genes;
            expect(Object.keys(genes)).toEqual(TRAITS.map((t) => t.name));
            for (const t of TRAITS) {
                expect(genes[t.name], `${name}.${t.name}`).toBe(t.index < 4 ? 0.3 : 0);
            }
        }
    });

    it('make a span table of TRAIT_SLOTS per spec, 0 in the spare slots', () => {
        const table = spanTable(config);
        expect(table).toHaveLength(SPEC_COUNT * TRAIT_SLOTS);
        expect(Array.from(table.subarray(0, 5))).toEqual([0.3, 0.3, 0.3, 0.3, 0]);
        expect(Array.from(table.subarray(18, TRAIT_SLOTS))).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('fill a trait a partial menu does not name from the defaults', () => {
        const partial = createConfig({ specialisations: { scout: { genes: { speed: 0.2 } } } });
        const table = spanTable(partial);
        const scout = SPEC_NAMES.indexOf('scout') * TRAIT_SLOTS;
        expect([table[scout + TRAIT_INDEX.SPEED], table[scout + TRAIT_INDEX.SIZE]]).toEqual([0.2, 0.3]);
    });

    it('are shared by no two specs, so editing one menu moves one spec', () => {
        expect(config.specialisations.forager.genes).not.toBe(config.specialisations.predator.genes);
    });
});

describe('geneMenuProblem', () => {
    it('accepts a menu of known traits with spans from 0 to the trait maximum', () => {
        expect(geneMenuProblem({})).toBeNull();
        expect(geneMenuProblem({ speed: MAX_TRAIT_SPAN, heatBand: MAX_OFFSET_SPAN, size: 0 })).toBeNull();
    });

    it('refuses a non-object, an unknown trait, a negative or too large span and a non-number', () => {
        expect(geneMenuProblem(null)).toMatch(/object/);
        expect(geneMenuProblem([])).toMatch(/object/);
        expect(geneMenuProblem({ strength: 0.1 })).toMatch(/strength is not one/);
        expect(geneMenuProblem({ speed: -0.1 })).toBe('a span from 0 to 0.5 at speed');
        expect(geneMenuProblem({ speed: 0.6 })).toBe('a span from 0 to 0.5 at speed');
        expect(geneMenuProblem({ heatBand: 21 })).toBe(`a span from 0 to ${MAX_OFFSET_SPAN} at heatBand`);
        expect(geneMenuProblem({ speed: '0.1' })).toMatch(/at speed/);
        expect(geneMenuProblem({ speed: Number.NaN })).toMatch(/at speed/);
        expect(maxSpanOf(trait('heatBand'))).toBe(MAX_OFFSET_SPAN);
    });

    it('is the rule of a spec: createConfig refuses an unknown name and a span over the maximum', () => {
        const menu = (/** @type {Record<string, unknown>} */ genes) => () =>
            createConfig({ specialisations: { scout: { genes } } });
        expect(menu({ speed: 0.2 })).not.toThrow();
        expect(menu({ strength: 0.2 })).toThrow(/specialisations\.scout\.genes/);
        expect(menu({ speed: 0.9 })).toThrow(/a span from 0 to 0.5 at speed/);
    });
});

describe('applyTraits', () => {
    it('shifts the six thresholds together by span x tanh(gene) degrees (heatBand)', () => {
        const { world, slot } = traitWorld();
        rebuild(world, slot);
        const base = laneBases(world.config, SPEC_NAMES[world.spec[slot]]);
        setSpan(world, slot, TRAIT_INDEX.HEAT_BAND, 8);
        setGene(world, slot, TRAIT_INDEX.HEAT_BAND, 0.5);
        rebuild(world, slot);
        const shift = 8 * Math.tanh(0.5);
        const names = trait('heatBand').effects.map((/** @type {{lane: string}} */ e) => e.lane);
        expect(names).toHaveLength(6);
        for (const name of names) {
            expect(world.lanes[name][slot], name).toBeCloseTo(base[name] + shift, 9);
        }
        expect(world.lanes.temperatureEfficiencyColdSevere[slot]).toBe(base.temperatureEfficiencyColdSevere);
    });

    it('trades two lanes on one gene: a speed-for-turning gene raises one and lowers the other', () => {
        const { world, slot } = traitWorld();
        rebuild(world, slot);
        const base = laneBases(world.config, 'forager');
        setSpan(world, slot, TRAIT_INDEX.AGILE_OR_FAST, 0.3);
        setGene(world, slot, TRAIT_INDEX.AGILE_OR_FAST, 1);
        rebuild(world, slot);
        const r = 1 + 0.3 * Math.tanh(1);
        expect(world.lanes.maxTurn[slot]).toBeCloseTo(base.maxTurn * r, 9);
        expect(world.lanes.maxVelocity[slot]).toBeCloseTo(base.maxVelocity / r, 9);
        expect(world.lanes.maxThrust[slot]).toBeCloseTo(base.maxThrust / r, 9);
    });

    it('moves nothing for the raw trait, whatever its span and gene', () => {
        const { world, slot } = traitWorld();
        rebuild(world, slot);
        const before = TRAITS.flatMap((t) => t.effects.map((e) => world.lanes[e.lane][slot]));
        setSpan(world, slot, TRAIT_INDEX.LEARN, 0.5);
        setGene(world, slot, TRAIT_INDEX.LEARN, 3);
        rebuild(world, slot);
        expect(TRAITS.flatMap((t) => t.effects.map((e) => world.lanes[e.lane][slot]))).toEqual(before);
    });

    it('reads the span of the slot own specialisation', () => {
        const { world, slot } = traitWorld(2);
        setSpan(world, slot, TRAIT_INDEX.SPEED, 0.2);
        setGene(world, slot, TRAIT_INDEX.SPEED, 1);
        rebuild(world, slot);
        const base = laneBases(world.config, 'reproducer');
        expect(world.lanes.maxVelocity[slot]).toBeCloseTo(base.maxVelocity * (1 + 0.2 * Math.tanh(1)), 9);
        world.spec[slot] = 0;
        rebuild(world, slot);
        expect(world.lanes.maxVelocity[slot]).toBe(laneBases(world.config, 'forager').maxVelocity);
    });

    it('applies a paired cost as r to the sign x exponent, with an exponent of 0 a no-op', () => {
        const priced = [
            {
                ...trait('speed'),
                effects: [],
                costs: [{ lane: 'temperatureGainMove', exponentKey: 'speedHeat', sign: 1 }],
            },
            {
                ...trait('burn'),
                effects: [{ lane: 'maxTurn', power: 0.5 }],
                costs: [{ lane: 'maxThrust', exponentKey: 'burnThrust', sign: -1 }],
            },
        ];
        const { world, slot } = traitWorld();
        const config = { ...world.config, speedHeat: 2, burnThrust: 0 };
        const spied = /** @type {Record<string, any>} */ ({ ...world, config });
        setSpan(spied, slot, TRAIT_INDEX.SPEED, 0.3);
        setSpan(spied, slot, TRAIT_INDEX.BURN, 0.2);
        setGene(spied, slot, TRAIT_INDEX.SPEED, 1);
        setGene(spied, slot, TRAIT_INDEX.BURN, -1);
        rebuild(spied, slot, priced);
        const base = laneBases(world.config, 'forager');
        const speed = 1 + 0.3 * Math.tanh(1);
        const burn = 1 + 0.2 * Math.tanh(-1);
        expect(spied.lanes.temperatureGainMove[slot]).toBeCloseTo(base.temperatureGainMove * speed ** 2, 9);
        expect(spied.lanes.maxThrust[slot]).toBe(base.maxThrust);
        expect(spied.lanes.maxTurn[slot]).toBeCloseTo(base.maxTurn * burn ** 0.5, 9);
    });

    it('is called by applyGenes, so a born agent has its trait lanes', () => {
        const { world, slot } = traitWorld();
        setSpan(world, slot, TRAIT_INDEX.SIZE, 0.3);
        setGene(world, slot, TRAIT_INDEX.SIZE, 1);
        applyGenes(world, slot);
        expect(world.lanes.baseSize[slot]).toBeCloseTo(world.config.baseSize * traitValue(1), 9);
    });

    it('reads a span table the world holds, one per world', () => {
        const { world } = traitWorld();
        expect(world.traitSpans).toBeInstanceOf(Float64Array);
        expect(world.traitSpans).toHaveLength(SPEC_COUNT * TRAIT_SLOTS);
        expect(world.traitSpans).not.toBe(traitWorld().world.traitSpans);
    });
});
