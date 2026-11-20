import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CURRICULUM,
    planRun,
    planStages,
    stageAt,
    untilStage,
    validateStageFloors,
} from '../../js/evo/curriculum.js';

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

const GATE = [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }];
const GATED = { name: 'nursery', config: null, gate: GATE, minGenerations: 2, maxGenerations: 9 };

describe('gated and fixed entries', () => {
    it('loads every committed evals/train-curriculum*.json as fixed stages, unchanged', () => {
        const files = readdirSync(new URL('../../evals/', import.meta.url)).filter((f) =>
            /^train-curriculum.*\.json$/.test(f),
        );
        expect(files.length).toBeGreaterThanOrEqual(5);
        for (const file of files) {
            const entries = JSON.parse(readFileSync(new URL(`../../evals/${file}`, import.meta.url), 'utf8'));
            expect(planRun(entries, 100).map((s) => [s.name, s.from, s.to])).toEqual(
                planStages(entries, 100).map((s) => [s.name, s.from, s.to]),
            );
        }
    });

    it("keeps a fixed entry's own fields in the run and leaves a gated stage unplanned", () => {
        const fixed = [
            { name: 'a', config: null, generations: 2, pool: 0.5, checkpointEvery: 3 },
            { name: 'w', config: null },
        ];
        expect(planRun(fixed, 5)[0]).toMatchObject({ generations: 2, pool: 0.5, checkpointEvery: 3, from: 0, to: 2 });
        const mixed = planRun([GATED, { name: 'w', config: null }], 50);
        expect(mixed.map((s) => [s.name, s.from, s.to])).toEqual([
            ['nursery', -1, -1],
            ['w', -1, -1],
        ]);
        expect(() => planStages([GATED, { name: 'w', config: null }], 50)).toThrow(/is gated/);
    });

    it('rejects a malformed gated entry, naming it', () => {
        const bad = (/** @type {Record<string, any>} */ patch) => () =>
            planRun(
                [
                    { ...GATED, ...patch },
                    { name: 'w', config: null },
                ],
                5,
            );
        expect(bad({ gate: [] })).toThrow(/curriculum\[0\] \(nursery\).*non-empty/);
        expect(bad({ generations: 3 })).toThrow(/not "generations"/);
        expect(bad({ minGenerations: 0 })).toThrow(/minGenerations/);
        expect(bad({ maxGenerations: 1 })).toThrow(/maxGenerations/);
        expect(bad({ maxGenerations: undefined })).toThrow(/maxGenerations/);
        expect(bad({ optional: 'yes' })).toThrow(/optional/);
        expect(bad({ pool: 2 })).toThrow(/pool/);
        expect(bad({ checkpointEvery: 0 })).toThrow(/checkpointEvery/);
        expect(() => planRun([{ name: 'a', config: null, generations: 1, minGenerations: 1 }, GATED], 5)).toThrow(
            /belongs to a gated stage/,
        );
    });

    it('cuts the entries after the --until stage and names the stages when it is unknown', () => {
        const entries = [GATED, { name: 'b', config: null, generations: 1 }, { name: 'w', config: null }];
        expect(untilStage(entries, 'b').map((e) => e.name)).toEqual(['nursery', 'b']);
        expect(() => untilStage(entries, 'zzz')).toThrow(/no stage "zzz".*nursery, b, w/);
    });
});

describe('validateStageFloors for the ladder stage names', () => {
    it.each(['hunt-contact', 'evade', 'arms-race', 'pack', 'habitat'])('refuses a floor in hunter stage %s', (name) => {
        const entries = [
            { name, config: 'floor.json', generations: 1 },
            { name: 'world', config: null },
        ];
        const world = { overridesOf: () => ({ minAgents: 20 }), targetMinAgents: 20 };
        expect(() => validateStageFloors(entries, world)).toThrow(/hunter stage/);
        expect(() =>
            validateStageFloors(entries, { overridesOf: () => ({ minAgents: 0 }), targetMinAgents: 20 }),
        ).not.toThrow();
    });
});
