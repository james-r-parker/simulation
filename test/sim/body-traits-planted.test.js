// Planted trait genes (body-genes T8): a gene of a new trait, with a span above 0 for the body's specialisation, moves
// exactly the lanes its registry entry names, and the readers see it; behind a span of 0 it moves nothing.

import { describe, expect, it } from 'vitest';
import { LANES } from '../../js/sim/body-lanes.js';
import { TRAITS, traitRatio } from '../../js/sim/body-traits.js';
import { OUTPUT_COUNT, OUTPUT_INDEX, TRAIT_INDEX } from '../../js/sim/brain-layout.js';
import { actAll } from '../../js/sim/physics.js';
import { applyGenes } from '../../js/sim/traits.js';
import { thrustEfficiency } from '../../js/sim/temperature.js';
import { setGene, setSpan, traitWorld } from './helpers/trait-world.js';

const trait = (/** @type {string} */ name) => /** @type {any} */ (TRAITS.find((candidate) => candidate.name === name));

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @returns {Record<string, number>} every lane of the slot
 */
const lanesOf = (world, slot) => Object.fromEntries(LANES.map((lane) => [lane.name, world.lanes[lane.name][slot]]));

/** The new traits the first lanes' readers serve, each with a span inside its menu's bound. */
/** @type {Array<[string, number]>} */
const PLANTED = [
    ['speed', 0.2],
    ['sprintStore', 0.3],
    ['fat', 0.3],
    ['heatBand', 8],
    ['burn', 0.2],
];

describe('a planted gene of a new trait', () => {
    it.each(PLANTED)('%s with a span above 0 moves exactly the lanes it names', (name, span) => {
        const { world, slot } = traitWorld();
        applyGenes(world, slot);
        const before = lanesOf(world, slot);
        const t = trait(name);
        setSpan(world, slot, t.index, span);
        setGene(world, slot, t.index, 1);
        applyGenes(world, slot);
        const after = lanesOf(world, slot);
        const named = new Set(t.effects.map((/** @type {any} */ e) => e.lane));
        const moved = LANES.map((lane) => lane.name).filter((lane) => after[lane] !== before[lane]);
        expect(moved.sort()).toEqual([...named].sort());
        const r = traitRatio(t, 1, span);
        for (const { lane, power } of t.effects) {
            const expected = t.kind === 'offset' ? before[lane] + r * power : before[lane] * r ** power;
            expect(after[lane], lane).toBeCloseTo(expected, 9);
        }
    });

    it.each(PLANTED)('%s behind a span of 0 moves no lane', (name) => {
        const { world, slot } = traitWorld();
        applyGenes(world, slot);
        const before = lanesOf(world, slot);
        setGene(world, slot, trait(name).index, 2);
        applyGenes(world, slot);
        expect(lanesOf(world, slot)).toEqual(before);
    });

    it('leaves every lane at its value with all the new genes planted and every new span 0', () => {
        const { world, slot } = traitWorld();
        applyGenes(world, slot);
        const before = lanesOf(world, slot);
        for (const t of TRAITS.filter((candidate) => candidate.index > TRAIT_INDEX.LEARN)) {
            setGene(world, slot, t.index, -1.5);
        }
        applyGenes(world, slot);
        expect(lanesOf(world, slot)).toEqual(before);
    });
});

describe('the readers see a planted gene', () => {
    it('a faster body thrusts harder, and a heat-tuned body keeps full efficiency where a base one tires', () => {
        const { world, slot } = traitWorld();
        world.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = 1;
        world.temperature[slot] = 70;
        world.vx[slot] = 0;
        world.vy[slot] = 0;
        world.angle[slot] = 0;
        applyGenes(world, slot);
        const tired = thrustEfficiency(world, slot);
        actAll(world);
        const base = world.vx[slot];
        setSpan(world, slot, trait('speed').index, 0.2);
        setGene(world, slot, trait('speed').index, 3);
        setSpan(world, slot, trait('heatBand').index, 8);
        setGene(world, slot, trait('heatBand').index, 3);
        applyGenes(world, slot);
        world.vx[slot] = 0;
        world.angle[slot] = 0;
        expect(tired).toBeLessThan(1);
        expect(thrustEfficiency(world, slot)).toBe(1);
        actAll(world);
        expect(world.vx[slot]).toBeCloseTo((base / tired) * traitRatio(trait('speed'), 3, 0.2), 4);
    });
});
