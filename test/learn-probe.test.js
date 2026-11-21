import { describe, expect, it } from 'vitest';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { breed } from '../js/evo/learn-probe.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createRng } from '../js/sim/rng.js';
import { isKnockedOut } from '../js/sim/traits.js';
import { parseArgs } from '../scripts/learn-probe.mjs';
import { formatLearn, summarise } from '../scripts/lib/learn-report.mjs';

describe('parseArgs', () => {
    it('defaults to every drill, 8 populations of 64 brains for 200 generations', () => {
        const args = parseArgs([]);
        expect(args).toMatchObject({ generations: 200, seeds: 8, population: 64, trials: 4, config: null, out: null });
        expect(args.lessons).toEqual(DRILLS.map((d) => d.name));
    });

    it('reads every flag and refuses an unknown lesson or flag', () => {
        const args = parseArgs([
            '--lessons',
            'food-ahead,prey-ahead',
            '--generations',
            '5',
            '--seeds',
            '2',
            '--workers',
            '3',
        ]);
        expect(args).toMatchObject({ lessons: ['food-ahead', 'prey-ahead'], generations: 5, seeds: 2, workers: 3 });
        expect(() => parseArgs(['--lessons', 'lucky'])).toThrow(/unknown lesson "lucky"/);
        expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
    });
});

describe('the report', () => {
    const run = (/** @type {string} */ lesson, /** @type {number[]} */ curve, reached = 0.5) => ({
        lesson,
        seed: 1,
        curve,
        reached,
    });

    it('summarises a lesson by its best and mean final score and how fast the populations got there', () => {
        const rows = summarise([run('a', [0.2, 0.95], 1), run('a', [0.1, 0.3], 0.5), run('b', [0.9], 0.9)]);
        expect(rows).toEqual([
            { lesson: 'a', best: 1, mean: 0.75, populations: 2, hit: 1, medianGenerations: 2 },
            { lesson: 'b', best: 0.9, mean: 0.9, populations: 1, hit: 1, medianGenerations: 1 },
        ]);
    });

    it('prints a row per lesson, with a dash for a lesson no population reached', () => {
        const text = formatLearn(summarise([run('a', [0.1], 0.2)]));
        expect(text.split('\n')).toHaveLength(2);
        expect(text).toMatch(/a\s+0\.20\s+0\.20\s+0 of 1\s+-/);
    });
});

describe('breed', () => {
    it('knocks out one hidden unit per child at unitKnockoutRate 1 and leaves the best parent intact', () => {
        const config = createConfig({ unitKnockoutRate: 1, mutationRate: 1e-9 });
        const layout = brainLayout(config);
        const parent = { row: new Float32Array(layout.weightCount), sigma: 0.05 };
        const children = breed([parent], { count: 4, config, rng: createRng(1) });
        expect(children[0]).toBe(parent);
        for (const child of children.slice(1)) {
            expect(Array.from(child.row.subarray(layout.leakStart)).filter(isKnockedOut)).toHaveLength(1);
        }
    });
});
