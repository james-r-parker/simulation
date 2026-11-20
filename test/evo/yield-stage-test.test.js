import { describe, expect, it } from 'vitest';
import { binomialTwoSidedP } from '../../js/evo/binomial.js';
import { compareYield } from '../../js/evo/yield-compare.js';
import { stageTests } from '../../js/evo/yield-stage-test.js';

const STAGES = ['nursery', 'hunt'];

/**
 * @param {number} offsets matched offsets, 0, 8, ...
 * @param {(i: number) => boolean} passesHunt whether the run at index i passes `hunt` (it always passes `nursery`)
 * @returns {{offset: number, score: number, passed: {stage: string}[]}[]} an arm's runs
 */
const arm = (offsets, passesHunt) =>
    Array.from({ length: offsets }, (_, i) => ({
        offset: i * 8,
        score: passesHunt(i) ? 2 : 1,
        passed: [{ stage: 'nursery' }, ...(passesHunt(i) ? [{ stage: 'hunt' }] : [])],
    }));

describe('stageTests', () => {
    it('counts the offsets that gained and lost each stage and tests the discordant ones exactly', () => {
        const before = arm(32, (i) => i >= 20);
        const after = arm(32, (i) => i >= 14);
        const [nursery, hunt] = stageTests(before, after, STAGES);
        expect(nursery).toMatchObject({ gained: 0, lost: 0, same: 32, p: 1, verdict: 'no verdict' });
        expect(hunt).toMatchObject({ gained: 6, lost: 0, same: 26, verdict: 'better' });
        expect(hunt.p).toBeCloseTo(binomialTwoSidedP(6, 6), 12);
    });

    it('reads worse when the stage was lost on enough offsets', () => {
        const [, hunt] = stageTests(
            arm(32, (i) => i < 10),
            arm(32, (i) => i < 4),
            STAGES,
        );
        expect(hunt).toMatchObject({ gained: 0, lost: 6, verdict: 'worse' });
    });

    it('reads 6 planted flips in 32 offsets as a verdict and 5 as none', () => {
        const base = arm(32, () => false);
        const six = stageTests(
            base,
            arm(32, (i) => i < 6),
            STAGES,
        )[1];
        const five = stageTests(
            base,
            arm(32, (i) => i < 5),
            STAGES,
        )[1];
        expect(six).toMatchObject({ gained: 6, verdict: 'better', leastFlips: 6 });
        expect(five).toMatchObject({ gained: 5, verdict: 'no verdict', leastFlips: 6 });
        expect(five.p).toBeCloseTo(0.0625, 12);
    });

    it('raises the flips needed when flips went the other way too', () => {
        const before = arm(32, (i) => i >= 8 && i < 16);
        const after = arm(32, (i) => (i >= 16 && i < 22) || (i >= 8 && i < 10));
        const hunt = stageTests(before, after, STAGES)[1];
        expect(hunt).toMatchObject({ gained: 6, lost: 6 });
        expect(hunt.verdict).toBe('no verdict');
        expect(hunt.leastFlips).toBeGreaterThan(6);
    });

    it('leaves out an offset only one arm ran, and returns nothing without pass lists', () => {
        const before = arm(4, () => false);
        const after = arm(3, () => true);
        expect(stageTests(before, after, STAGES)[1]).toMatchObject({ gained: 3, same: 0 });
        expect(stageTests([{ offset: 0 }], [{ offset: 0 }], STAGES)).toEqual([]);
    });
});

describe('compareYield stage tests', () => {
    it('carries the stage tests beside the run-level verdict, which does not read them', () => {
        const before = arm(32, () => false);
        const after = arm(32, (i) => i < 6);
        const result = compareYield(before, after, { stages: { before: STAGES, after: STAGES } });
        expect(result.stageTests.map((t) => t.verdict)).toEqual(['no verdict', 'better']);
        expect(result.up).toBe(6);
        expect(result.verdict).toBe('better');
        expect(compareYield(before, before, { stages: { before: STAGES, after: STAGES } }).stageTests[1].verdict).toBe(
            'no verdict',
        );
    });

    it('has no stage tests without stage names or when the ladders differ', () => {
        const runs = arm(16, () => true);
        expect(compareYield(runs, runs).stageTests).toEqual([]);
        expect(compareYield(runs, runs, { stages: { before: ['a'], after: ['b'] } }).stageTests).toEqual([]);
    });
});
