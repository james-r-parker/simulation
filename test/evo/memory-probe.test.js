import { describe, expect, it } from 'vitest';
import {
    GAIN_MARGIN,
    GOOD_SCORE,
    groupReading,
    probeGroup,
    probeScenario,
    probeSubject,
    readProbe,
} from '../../js/evo/memory-probe.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';
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
            'scenario: expected one of food-then-blind, predator-out-of-view, scent-after-sight-loss, food-then-blind@600, group-hunt, got "nap"',
        );
    });
});

describe('groupReading', () => {
    it('reads coordination, the senses-over-blind ratio and the per-hunter gain', () => {
        const reading = groupReading({ senses: 0.9, 'kin-blind': 0.3, solo: 0.6 });
        expect(reading.coordination).toBeCloseTo(0.6);
        expect(reading.ratio).toBeCloseTo(3);
        expect(reading.gain).toBeCloseTo(0.9 / 3 / 0.6);
    });

    it('gives no ratio when the blind trio never killed and no gain when the solo hunter never did', () => {
        expect(groupReading({ senses: 0.5, 'kin-blind': 0, solo: 0 })).toEqual({
            coordination: 0.5,
            ratio: null,
            gain: null,
        });
    });
});

describe('the probes on a hunter', () => {
    const idle = { name: 'idle', id: 7, spec: 1, weights: null, act: () => {} };
    const striker = { ...oracleSubject('prey-ahead'), spec: 1 };

    it('probeGroup skips a specialisation that cannot hunt, and says why', () => {
        expect(probeGroup({ ...idle, spec: 0 }, { trials: 1 })).toMatchObject({
            coordination: null,
            skipped: 'the specialisation cannot hunt',
        });
    });

    it('probeGroup scores an idle trio and solo hunter at 0 and logs one trial per control', () => {
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = {
            level: 'debug',
            log: (/** @type {string} */ _level, /** @type {string} */ event, /** @type {any} */ fields) =>
                records.push({ event, ...fields }),
        };
        const result = probeGroup({ ...idle, spec: null }, { trials: 1, log: /** @type {any} */ (log) });
        expect(result).toMatchObject({ scores: { senses: 0, 'kin-blind': 0, solo: 0 }, ratio: null, gain: null });
        expect(records.map((r) => [r.event, r.control, r.score])).toEqual([
            ['ProbeTrial', 'senses', 0],
            ['ProbeTrial', 'kin-blind', 0],
            ['ProbeTrial', 'solo', 0],
        ]);
    });

    it('probeGroup logs nothing without a log, and a hunter that kills scores above 0 alone', () => {
        const result = probeGroup(striker, { trials: 2 });
        expect(result.scores.solo).toBeGreaterThan(0);
        /** @type {number[]} */
        const scores = [];
        const log = {
            level: 'debug',
            log: (/** @type {string} */ _l, /** @type {string} */ _e, /** @type {any} */ f) => scores.push(f.score),
        };
        probeGroup(striker, { trials: 2, log: /** @type {any} */ (log) });
        expect(scores).toContain(1);
        expect(result.gain).not.toBeNull();
    });

    it.each(SCENARIOS.map((s) => [s.name, s]))(
        'probeScenario runs %s for one trial and reads it',
        (_name, scenario) => {
            const result = probeScenario(scenario, idle, { trials: 1 });
            expect(result.skipped).toBeNull();
            expect(Object.keys(result.scores)).toEqual(
                scenario.windowed ? ['intact', 'blindfold', 'amnesia'] : ['intact', 'amnesia'],
            );
            expect(result.reading).not.toBeNull();
        },
    );

    it('probeSubject runs only the named scenario, and the group probe only when named', () => {
        const scentOnly = probeSubject(idle, { scenarios: ['scent-after-sight-loss'], trials: 1 });
        expect(scentOnly.scenarios.map((s) => s.scenario)).toEqual(['scent-after-sight-loss']);
        expect(scentOnly.group).toBeNull();
        const groupOnly = probeSubject(idle, { scenarios: ['group-hunt'], trials: 1 });
        expect(groupOnly.scenarios).toEqual([]);
        expect(groupOnly.group?.scores).toEqual({ senses: 0, 'kin-blind': 0, solo: 0 });
    });

    it('probeSubject runs every scenario and the group probe by default', () => {
        const all = probeSubject(idle, { trials: 1 });
        expect(all.scenarios).toHaveLength(SCENARIOS.length);
        expect(all.group).not.toBeNull();
    });
});
