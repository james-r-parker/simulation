import { describe, expect, it } from 'vitest';
import { planScreen } from '../scripts/lib/train-screen-grid.mjs';
import { armDir, bestRunDir, historyOf, isFinalist, screenGrid, verdictOf } from '../scripts/lib/train-tune-plan.mjs';

const spec = { curriculum: 'l.json', until: 'b', tunables: [{ key: 'episodes', values: [16] }] };
const arm = { name: 'episodes-16', overlay: { train: { episodes: 16 } } };

describe('screenGrid', () => {
    it('lays base and the arms in a grid the screen accepts, with the feasibility check small and on', () => {
        const grid = screenGrid({ ...spec, train: { checkpointEvery: 5 } }, [arm], [0, 8]);
        expect(grid).toMatchObject({
            curriculum: 'l.json',
            until: 'b',
            offsets: [0, 8],
            generations: 380,
            workersPerRun: 8,
            feasible: { generations: 60, seeds: 4 },
            train: { checkpointEvery: 5 },
            reference: 'base',
            arms: { base: {}, 'episodes-16': { train: { episodes: 16 } } },
        });
        const plan = planScreen(/** @type {any} */ (grid), () => [{ name: 'a' }, { name: 'b' }]);
        expect(plan.arms.map((a) => a.name)).toEqual(['base', 'episodes-16']);
        expect(plan.arms[1].train).toEqual({ checkpointEvery: 5, episodes: 16 });
    });

    it('turns the check off for the held-out screen, takes the spec sizes and leaves out an unset until and train', () => {
        const { until, ...noUntil } = spec;
        const grid = screenGrid({ ...noUntil, generations: 4, workersPerRun: 1, feasible: { seeds: 2 } }, [], [0]);
        expect(until).toBe('b');
        expect(grid).not.toHaveProperty('until');
        expect(grid).not.toHaveProperty('train');
        expect(grid).toMatchObject({ generations: 4, workersPerRun: 1, feasible: { seeds: 2 }, arms: { base: {} } });
        expect(screenGrid(spec, [arm], [0], { feasible: false }).feasible).toBe(false);
    });
});

describe('verdictOf and isFinalist', () => {
    const verdicts = {
        arms: { a: { verdict: 'better', compare: { meanDiff: 0.4, p: 0.01 } }, b: { verdict: 'refused' } },
    };

    it('reads an arm verdict with its mean difference and p, or missing', () => {
        expect(verdictOf(verdicts, 'a')).toEqual({ verdict: 'better', meanDiff: 0.4, p: 0.01 });
        expect(verdictOf(verdicts, 'b')).toEqual({ verdict: 'refused', meanDiff: null, p: null });
        expect(verdictOf(verdicts, 'c').verdict).toBe('missing');
        expect(verdictOf(undefined, 'c').verdict).toBe('missing');
    });

    it('makes a finalist only of an arm better on both screens', () => {
        const better = { verdict: 'better' };
        expect(isFinalist(better, better)).toBe(true);
        expect(isFinalist(better, { verdict: 'no verdict' })).toBe(false);
        expect(isFinalist(better, null)).toBe(false);
        expect(isFinalist({ verdict: 'worse' }, better)).toBe(false);
        expect(isFinalist(null, null)).toBe(false);
    });
});

describe('bestRunDir', () => {
    it('picks the best score, the lowest offset on a tie, and null for no run', () => {
        const perRun = [
            { dir: 'x/o8', offset: 8, score: 2.5 },
            { dir: 'x/o0', offset: 0, score: 2.5 },
            { dir: 'x/o16', offset: 16, score: 1 },
        ];
        expect(bestRunDir({ perRun })).toBe('x/o0');
        expect(bestRunDir({ perRun: [] })).toBeNull();
        expect(bestRunDir(undefined)).toBeNull();
    });
});

describe('historyOf and armDir', () => {
    it('lists each past arm with its ladder hash, and tolerates a night with no arms', () => {
        const results = [{ ladderHash: 'h1', arms: [{ signature: 's1' }, { signature: 's2' }] }, { ladderHash: 'h2' }];
        expect(historyOf(results)).toEqual([
            { ladderHash: 'h1', signature: 's1' },
            { ladderHash: 'h1', signature: 's2' },
        ]);
    });

    it('makes a directory name of an arm name', () => {
        expect(armDir('a b/c-0.7')).toBe('a_b_c-0.7');
    });
});
