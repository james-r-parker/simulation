// The adaptive ladder and its screen (docs/designs/training-loop.md, Phase 3): `evals/train-ladder-adaptive.json` is the fixed
// ladder with one adaptive hunt stage in place of the three hunt rungs, and `evals/train-screens/adaptive.grid.json` screens
// it against the fixed one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateStageFloors } from '../js/evo/curriculum.js';
import { createConfig } from '../js/sim/config.js';
import { planScreen } from '../scripts/lib/train-screen-grid.mjs';
import { loadStages } from '../scripts/lib/train-state.mjs';

/** @param {string} path a repo-relative JSON file @returns {any} its contents */
const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const LADDER = readJson('evals/train-ladder.json');
const ADAPTIVE = readJson('evals/train-ladder-adaptive.json');
const args = /** @type {any} */ ({
    curriculum: 'evals/train-ladder-adaptive.json',
    config: null,
    until: null,
    generations: 2,
    checkpointEvery: 1,
});

describe('evals/train-ladder-adaptive.json', () => {
    it('is the ladder with one adaptive hunt stage in place of hunt-weak, hunt-mid and hunt', () => {
        const names = LADDER.map((/** @type {any} */ e) => e.name).filter(
            (/** @type {string} */ n) => n !== 'hunt-weak' && n !== 'hunt-mid',
        );
        expect(ADAPTIVE.map((/** @type {any} */ e) => e.name)).toEqual(names);
        const { adapt, ...hunt } = ADAPTIVE.find((/** @type {any} */ e) => e.name === 'hunt');
        expect(hunt).toEqual(LADDER.find((/** @type {any} */ e) => e.name === 'hunt'));
        expect(adapt).toEqual({ param: 'preySprint', drill: 'prey-ahead', from: 0.1, to: 1, step: 0.05, target: 0.5 });
        const others = (/** @type {any[]} */ ladder) =>
            ladder.filter((e) => !['hunt-weak', 'hunt-mid', 'hunt'].includes(e.name));
        expect(others(ADAPTIVE)).toEqual(others(LADDER));
    });

    it('loads and validates through the trainer, with the floors accepted', () => {
        expect(loadStages(args).find((s) => s.name === 'hunt')?.adapt?.drill).toBe('prey-ahead');
        expect(() =>
            validateStageFloors(ADAPTIVE, {
                overridesOf: (config) => readJson(config),
                targetMinAgents: createConfig({}).minAgents,
            }),
        ).not.toThrow();
    });

    it('gives the stage the rules hash the fixed ladder gives hunt', () => {
        const hash = (/** @type {any} */ a) => loadStages(a).find((s) => s.name === 'hunt')?.rulesHash;
        expect(hash(args)).toBe(hash({ ...args, curriculum: 'evals/train-ladder.json' }));
    });
});

describe('evals/train-screens/adaptive.grid.json', () => {
    it('plans an adaptive arm and the fixed reference on offsets 0 to 120 by 8, up to hunt', () => {
        const plan = planScreen(readJson('evals/train-screens/adaptive.grid.json'), (file) => readJson(file));
        expect(plan.offsets).toEqual(Array.from({ length: 16 }, (_, i) => i * 8));
        expect(plan).toMatchObject({ until: 'hunt', generations: 380, reference: 'fixed', feasible: null });
        expect(plan.arms.map((a) => [a.name, a.curriculum])).toEqual([
            ['fixed', 'evals/train-ladder.json'],
            ['adaptive', 'evals/train-ladder-adaptive.json'],
        ]);
        expect(plan.arms.every((a) => a.train.checkpointEvery === 5)).toBe(true);
        expect(plan.arms[1].ladder.find((/** @type {any} */ e) => e.name === 'hunt')?.adapt).toBeDefined();
    });
});
