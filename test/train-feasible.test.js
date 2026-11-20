import { describe, expect, it } from 'vitest';
import { formatFeasible } from '../scripts/lib/feasible-run.mjs';
import { parseArgs } from '../scripts/train-feasible.mjs';

describe('train:feasible arguments', () => {
    it('needs a curriculum and defaults to the probe sizes', () => {
        expect(() => parseArgs([])).toThrow(/--curriculum is required/);
        const args = parseArgs(['--curriculum', 'ladder.json']);
        expect(args).toMatchObject({ generations: 200, seeds: 8, population: 64, trials: 4, until: null, out: null });
    });

    it('takes size overrides, a stage to stop at, a worker count and the output files', () => {
        const args = parseArgs([
            ...['--curriculum', 'a.json', '--until', 'hunt', '--generations', '3', '--seeds', '2'],
            ...['--population', '8', '--trials', '1', '--workers', '4', '--out', 'f.json', '--log-dir', 'logs'],
        ]);
        expect(args).toMatchObject({ until: 'hunt', generations: 3, seeds: 2, population: 8, trials: 1, workers: 4 });
        expect(args).toMatchObject({ out: 'f.json', logDir: 'logs' });
    });

    it('refuses an unknown flag', () => {
        expect(() => parseArgs(['--curriculum', 'a.json', '--nope'])).toThrow(/unknown argument/);
    });
});

describe('formatFeasible', () => {
    it('prints a line per stage with the verdict, the bar, the fair band and the unchecked readings', () => {
        const lines = formatFeasible([
            {
                stage: 'hunt',
                learnable: false,
                unchecked: ['retention.all'],
                drills: [
                    {
                        drill: 'prey-ahead',
                        bar: 0.4,
                        reached: 0,
                        populations: 8,
                        best: 0.25,
                        finals: [],
                        fairBand: { predator: [], hunter: [0.2, 0.4] },
                        learnable: false,
                    },
                ],
            },
            { stage: 'nursery', learnable: true, unchecked: [], drills: [] },
            { stage: 'arms-race', learnable: null, unchecked: ['crossplay.cycleShare'], drills: [] },
        ]);
        expect(lines[0]).toBe(
            'hunt: UNLEARNABLE - prey-ahead 0/8 at bar 0.40 (best 0.25) fair-band predator:empty,hunter:2; unchecked: retention.all',
        );
        expect(lines[1]).toBe('nursery: learnable - no drill to check');
        expect(lines[2]).toBe('arms-race: not checked - no drill to check; unchecked: crossplay.cycleShare');
    });
});
