import { describe, expect, it } from 'vitest';
import {
    LEARN_GENERATIONS,
    LEARN_POPULATION,
    LEARN_SEEDS,
    breed,
    generationsToReach,
    learnLesson,
} from '../../js/evo/learn-probe.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng } from '../../js/sim/rng.js';

/** @type {import('../../js/evo/drill-scenarios.js').Drill} a lesson one output decides: move forward at all in 10 ticks */
const FORWARD = {
    name: 'forward',
    scene: 'test',
    spec: 0,
    needsHunter: false,
    plan: () => ({
        stage: {
            foods: [],
            rocks: [],
            agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
        },
        timing: null,
        scent: false,
        maxTicks: 10,
        done: () => false,
        won: (world) => world.x[0] > 1500.5,
    }),
};
const SMALL = { population: 16, generations: 12, trials: 3, finalTrials: 8 };

describe('learnLesson', () => {
    it('reaches a lesson one output decides', () => {
        const result = learnLesson(FORWARD, { ...SMALL, seed: 1 });
        expect(result.curve).toHaveLength(SMALL.generations);
        expect(Math.max(...result.curve)).toBe(1);
        expect(result.reached).toBeGreaterThan(0.5);
        expect(generationsToReach(result.curve)).not.toBeNull();
    });

    it('gives the same curve from the same seed and another from another', () => {
        const a = learnLesson(FORWARD, { ...SMALL, seed: 2, generations: 4 });
        expect(learnLesson(FORWARD, { ...SMALL, seed: 2, generations: 4 })).toEqual(a);
        const other = learnLesson(FORWARD, { ...SMALL, seed: 3, generations: 4 });
        expect(JSON.stringify(other)).not.toBe(JSON.stringify(a));
    });

    it('returns scores only: no genome, weights or population leave it', () => {
        const drill = /** @type {any} */ (DRILLS.find((d) => d.name === 'food-ahead'));
        const result = learnLesson(drill, { population: 4, generations: 1, trials: 1, finalTrials: 2 });
        expect(Object.keys(result).sort()).toEqual(['curve', 'lesson', 'reached', 'seed']);
    });

    it('logs one LearnGeneration per generation', () => {
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = {
            log: (/** @type {string} */ _level, /** @type {string} */ event, /** @type {any} */ fields) =>
                records.push({ event, ...fields }),
        };
        learnLesson(FORWARD, { ...SMALL, generations: 3, log: /** @type {any} */ (log) });
        expect(records.map((r) => r.event)).toEqual(['LearnGeneration', 'LearnGeneration', 'LearnGeneration']);
        expect(records[2]).toMatchObject({ lesson: 'forward', seed: 1, generation: 2 });
    });
});

describe('generationsToReach', () => {
    it('counts generations from 1 and is null when the curve never gets there', () => {
        expect(generationsToReach([0.1, 0.5, 0.95, 1])).toBe(3);
        expect(generationsToReach([0.1, 0.5])).toBeNull();
        expect(generationsToReach([0.4, 0.6], 0.5)).toBe(2);
    });
});

describe('the probe sizes', () => {
    it('are the plan: 8 populations of 64 brains for 200 generations', () => {
        expect([LEARN_SEEDS, LEARN_POPULATION, LEARN_GENERATIONS]).toEqual([8, 64, 200]);
    });
});

describe('breed', () => {
    it('steps the trait genes only through mutateTraits: with traitMutationSigma 0 a child keeps the trait block', () => {
        const config = createConfig({ traitMutationSigma: 0, mutationRate: 1 });
        const layout = brainLayout(config);
        const row = new Float32Array(layout.weightCount);
        row.fill(0.5, layout.traitStart, layout.leakStart);
        row[layout.traitStart] = 3.5;
        const [, child] = breed([{ row, sigma: 0.1 }], { count: 2, config, rng: createRng(5) });
        const traits = Array.from(child.row.subarray(layout.traitStart, layout.leakStart));
        expect(traits[0]).toBe(config.traitGeneClamp);
        expect(traits.slice(1)).toEqual(new Array(traits.length - 1).fill(0.5));
        expect(child.row[layout.leakStart]).not.toBe(row[layout.leakStart]);
    });
});
