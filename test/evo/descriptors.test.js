import { describe, expect, it } from 'vitest';
import { bodyPlanOf, descriptorV1, descriptorV6, roleSkillOf } from '../../js/evo/descriptors.js';
import { createArchive } from '../../js/evo/archive.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

describe('roleSkillOf', () => {
    it('is the deliberate share of intake', () => {
        expect(roleSkillOf(30, 10)).toBe(0.75);
        expect(roleSkillOf(0, 10)).toBe(0);
        expect(roleSkillOf(10, 0)).toBe(1);
    });

    it('is 0 when nothing was eaten', () => {
        expect(roleSkillOf(0, 0)).toBe(0);
    });
});

describe('bodyPlanOf', () => {
    it('maps the two traits from 0.7 to 1.3 onto 0 to 1', () => {
        expect(bodyPlanOf(1.3, 1.3)).toBeCloseTo(1);
        expect(bodyPlanOf(1, 1)).toBeCloseTo(0.5);
        expect(bodyPlanOf(0.7, 0.7)).toBeCloseTo(0);
    });

    it('clamps values outside the trait span', () => {
        expect(bodyPlanOf(2, 2)).toBe(1);
        expect(bodyPlanOf(0, 0)).toBe(0);
    });
});

describe('descriptorV1', () => {
    const point = new Float64Array(2);

    it('is the mean speed sample and the mean crowding sample', () => {
        const deaths = { samples: [4], speedSum: [3] };
        const counters = { crowdingSamples: [2], crowdingSum: [0.5] };
        descriptorV1.point({ deaths, row: 0, counters, slot: 0 }, point);
        expect(Array.from(point)).toEqual([0.75, 0.25]);
    });

    it('caps the speed at 1 and is 0 without samples', () => {
        const counters = { crowdingSamples: [0], crowdingSum: [0] };
        descriptorV1.point({ deaths: { samples: [2], speedSum: [9] }, row: 0, counters, slot: 0 }, point);
        expect(point[0]).toBe(1);
        descriptorV1.point({ deaths: { samples: [0], speedSum: [9] }, row: 0, counters, slot: 0 }, point);
        expect(Array.from(point)).toEqual([0, 0]);
    });
});

describe('descriptorV6', () => {
    it('reads the role skill and body plan of the death-log row', () => {
        const point = new Float64Array(2);
        const deaths = { roleSkill: [0, 0.8], bodyPlan: [0, 0.3] };
        descriptorV6.point({ deaths, row: 1, counters: {}, slot: 0 }, point);
        expect(Array.from(point)).toEqual([0.8, 0.3]);
    });
});

describe('createArchive descriptor option', () => {
    const layout = brainLayout(createConfig({ rayCount: 2, brainHidden: 4 }));

    it('defaults to descriptorV1', () => {
        expect(createArchive(layout).descriptor).toBe(descriptorV1);
    });

    it('keeps the descriptor it is given', () => {
        expect(createArchive(layout, { descriptor: descriptorV6 }).descriptor).toBe(descriptorV6);
    });
});
