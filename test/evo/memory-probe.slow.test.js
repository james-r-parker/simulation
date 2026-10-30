import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createSimLog } from '../../js/sim/log.js';
import { probeScenario, probeSubject } from '../../js/evo/memory-probe.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { SCENARIOS } from '../../js/evo/memory-probe-scenarios.js';

const [food, , scent] = SCENARIOS;

/**
 * @param {(i: number) => number} weight the weight of float `i`
 * @returns {{name: string, id: number, spec: number, weights: Float32Array, act: null}} a genome subject
 */
function genome(weight) {
    const count = brainLayout(createConfig({})).weightCount;
    return { name: 'g', id: 1, spec: 0, weights: Float32Array.from({ length: count }, (_, i) => weight(i)), act: null };
}

describe('the reference controllers', () => {
    it('a memoryless controller scores a gain of 0 in every scenario, and an equal score under each control', () => {
        const result = probeSubject(referenceSubject('memoryless'), {
            trials: 8,
            scenarios: SCENARIOS.map((s) => s.name),
        });
        for (const scenario of result.scenarios) {
            expect(scenario.gain).toBe(0);
            expect(scenario.scores.amnesia).toBe(scenario.scores.blindfold ?? scenario.scores.intact);
        }
    });

    it.each(['food-then-blind', 'food-then-blind@600'])(
        'a controller that stores its target in MEMORY_A scores a clearly positive gain in %s',
        (name) => {
            const scenario = /** @type {any} */ (SCENARIOS.find((s) => s.name === name));
            const result = probeScenario(scenario, referenceSubject('memory-storing'), { trials: 16 });
            expect(result.gain).toBeGreaterThanOrEqual(0.5);
            expect(result.reading).toBe('strong evidence for memory');
        },
    );

    it('the same controller on a config that moves the body block still scores a positive gain', () => {
        const result = probeScenario(food, referenceSubject('memory-storing'), { trials: 8, config: { rayCount: 24 } });
        expect(result.gain).toBeGreaterThanOrEqual(0.5);
    });
});

describe('probeScenario', () => {
    it('reports the intact, blindfold and amnesia scores and the gain between the last two', () => {
        const result = probeScenario(food, referenceSubject('memory-storing'), { trials: 2 });
        expect(Object.keys(result.scores)).toEqual(['intact', 'blindfold', 'amnesia']);
        expect(result.gain).toBe(result.scores.blindfold - result.scores.amnesia);
        expect(result.metric).toBe('probe.food_reach');
    });

    it('has no blindfold control where the scenario has no window', () => {
        const hunter = { ...genome(() => 0), spec: 1 };
        const result = probeScenario(scent, hunter, { trials: 1 });
        expect(Object.keys(result.scores)).toEqual(['intact', 'amnesia']);
        expect(result.gain).toBe(result.scores.intact - result.scores.amnesia);
    });

    it('logs one ProbeTrial per trial and control at debug level', () => {
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        probeScenario(food, referenceSubject('memoryless'), { trials: 2, log });
        expect(records).toHaveLength(6);
        expect(records[0]).toEqual({
            level: 'debug',
            event: 'ProbeTrial',
            scenario: 'food-then-blind',
            genomeId: 0,
            control: 'intact',
            trial: 0,
            score: expect.any(Number),
        });
    });

    it('replays bit for bit from the seed and the genome', () => {
        const subject = genome((i) => Math.sin(i) * 0.3);
        const a = probeScenario(food, subject, { trials: 3, seed: 4 });
        const b = probeScenario(food, subject, { trials: 3, seed: 4 });
        expect(b).toEqual(a);
    });

    it('runs the named scenarios only', () => {
        const result = probeSubject(referenceSubject('memoryless'), { scenarios: ['food-then-blind'], trials: 1 });
        expect(result.scenarios.map((s) => s.scenario)).toEqual(['food-then-blind']);
    });
});
