import { describe, expect, it } from 'vitest';
import { describeSubject, setScores } from '../scripts/lib/probe-report.mjs';

/** @type {import('../js/evo/memory-probe.js').ScenarioResult} */
const FOOD = {
    scenario: 'food-then-blind',
    metric: 'probe.food_reach',
    scores: { intact: 1, blindfold: 0.75, amnesia: 0.25 },
    gain: 0.5,
    reading: 'internal state contributes',
    skipped: null,
};
/** @type {import('../js/evo/memory-probe.js').ScenarioResult} */
const SKIPPED = {
    scenario: 'scent-after-sight-loss',
    metric: 'probe.scent_follow',
    scores: {},
    gain: null,
    reading: null,
    skipped: 'the specialisation cannot hunt',
};
/** @type {import('../js/evo/memory-probe.js').GroupResult} */
const GROUP = {
    scores: { senses: 0.5, 'kin-blind': 0.25, solo: 0.5 },
    coordination: 0.25,
    ratio: 2,
    gain: 1 / 3,
    skipped: null,
};

describe('describeSubject', () => {
    it('prints a line per scenario with the scores per control, the gain and the reading', () => {
        const lines = describeSubject('champion a', { scenarios: [FOOD], group: null });
        expect(lines).toEqual([
            'champion a',
            '  food-then-blind          intact 1.00  blindfold 0.75  amnesia 0.25  gain +0.50  internal state contributes',
        ]);
    });

    it('says why a scenario was skipped, and prints the group line with its ratio and per-hunter gain', () => {
        const lines = describeSubject('champion a', { scenarios: [SKIPPED], group: GROUP });
        expect(lines[1]).toBe('  scent-after-sight-loss   skipped: the specialisation cannot hunt');
        expect(lines[2]).toBe(
            '  group-hunt               senses 0.50  kin-blind 0.25  solo 0.50  coordination +0.25  ratio 2.00  per-hunter gain 0.33',
        );
    });

    it('writes n/a for a ratio or gain with no denominator and a minus sign for a negative gain', () => {
        const group = { ...GROUP, ratio: null, gain: null, coordination: -0.25 };
        const lines = describeSubject('x', { scenarios: [{ ...FOOD, gain: -0.25 }], group });
        expect(lines[1]).toContain('gain -0.25');
        expect(lines[2]).toContain('coordination -0.25  ratio n/a  per-hunter gain n/a');
    });
});

describe('setScores', () => {
    it('is the mean over the genomes of each metric and gain, skipping the ones that were not probed', () => {
        const a = { scenarios: [FOOD, SKIPPED], group: GROUP };
        const b = {
            scenarios: [{ ...FOOD, scores: { intact: 1, blindfold: 0.25, amnesia: 0 }, gain: 0.25 }],
            group: null,
        };
        expect(setScores([a, b])).toEqual({
            'probe.food_reach': 0.5,
            'probe.memory_gain.food-then-blind': 0.375,
            'probe.group_coordination': 0.25,
            'probe.group_gain': 1 / 3,
        });
    });

    it('is empty for no genomes', () => {
        expect(setScores([])).toEqual({});
    });
});
