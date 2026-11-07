import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRICULUM, planStages, stageAt } from '../../js/evo/curriculum.js';

const FILE = JSON.parse(readFileSync(new URL('../../evals/train-curriculum.json', import.meta.url), 'utf8'));

describe('planStages', () => {
    it('lays the committed curriculum out as nursery 20, hunt 20, world the rest', () => {
        expect(planStages(FILE, 50).map((s) => [s.name, s.from, s.to])).toEqual([
            ['nursery', 0, 20],
            ['hunt', 20, 40],
            ['world', 40, 50],
        ]);
    });

    it('drops a stage the run never reaches and cuts one it crosses', () => {
        expect(planStages(FILE, 40).map((s) => s.name)).toEqual(['nursery', 'hunt']);
        expect(planStages(FILE, 25).map((s) => [s.name, s.to])).toEqual([
            ['nursery', 20],
            ['hunt', 25],
        ]);
    });

    it('runs the last stage to the end whatever its generations say', () => {
        const plan = planStages([{ name: 'a', config: null, generations: 2 }], 7);
        expect(plan).toEqual([{ name: 'a', config: null, from: 0, to: 7 }]);
    });

    it('runs the default config for every generation without a curriculum', () => {
        expect(planStages(DEFAULT_CURRICULUM, 3)).toEqual([{ name: 'default', config: null, from: 0, to: 3 }]);
    });

    it('rejects an empty list, a missing generations before the last, a duplicate name and a bad config', () => {
        expect(() => planStages([], 3)).toThrow(/non-empty/);
        for (const entry of [null, 'a', { config: null }, { name: '', config: null }]) {
            expect(() => planStages([/** @type {any} */ (entry)], 3)).toThrow(/curriculum\[0\]: expected an object/);
        }
        expect(() =>
            planStages(
                [
                    { name: 'a', config: null },
                    { name: 'b', config: null },
                ],
                3,
            ),
        ).toThrow(/curriculum\[0\] \(a\)/);
        expect(() =>
            planStages(
                [
                    { name: 'a', config: null, generations: 1 },
                    { name: 'a', config: null },
                ],
                3,
            ),
        ).toThrow(/distinct/);
        expect(() => planStages([{ name: 'a', config: /** @type {any} */ (3) }], 3)).toThrow(/config/);
        expect(() =>
            planStages(
                [
                    { name: 'a', config: null, generations: 0 },
                    { name: 'b', config: null },
                ],
                3,
            ),
        ).toThrow(/generations/);
    });
});

describe('stageAt', () => {
    it('switches config at the stage boundary', () => {
        const plan = planStages(FILE, 50);
        expect([0, 19, 20, 39, 40, 49].map((g) => stageAt(plan, g).name)).toEqual([
            'nursery',
            'nursery',
            'hunt',
            'hunt',
            'world',
            'world',
        ]);
        expect(() => stageAt(plan, 50)).toThrow(RangeError);
    });
});
