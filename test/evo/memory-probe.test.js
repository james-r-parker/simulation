import { describe, expect, it } from 'vitest';
import { GAIN_MARGIN, GOOD_SCORE, probeScenario, probeSubject, readProbe } from '../../js/evo/memory-probe.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { SCENARIOS } from '../../js/evo/memory-probe-scenarios.js';

const scent = SCENARIOS[2];

describe('readProbe', () => {
    it.each([
        [0.9, 0.9, 'solvable from the current senses; no memory is shown'],
        [0.8, 0.5, 'internal state contributes'],
        [0.1, 0.1, 'not evolved, or too hard for this brain'],
        [0.9, 0.1, 'strong evidence for memory'],
    ])('reads intact %f and amnesia %f as "%s"', (intact, amnesia, reading) => {
        expect(readProbe(intact, amnesia)).toBe(reading);
    });

    it('keeps the thresholds the table is read with', () => {
        expect(GOOD_SCORE).toBe(0.5);
        expect(GAIN_MARGIN).toBe(0.1);
    });
});

describe('probeScenario', () => {
    it('skips a hunting scenario for a specialisation that cannot hunt, and says why', () => {
        const genome = { name: 'g', id: 1, spec: 0, weights: null, act: null };
        const result = probeScenario(scent, genome, { trials: 1 });
        expect(result).toMatchObject({ gain: null, reading: null, skipped: 'the specialisation cannot hunt' });
    });
});

describe('probeSubject', () => {
    it('rejects an unknown scenario name, listing the known ones', () => {
        expect(() => probeSubject(referenceSubject('memoryless'), { scenarios: ['nap'] })).toThrow(
            'scenario: expected one of food-then-blind, predator-out-of-view, scent-after-sight-loss, food-then-blind@600, got "nap"',
        );
    });
});
