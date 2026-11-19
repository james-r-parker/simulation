// A tuning night end to end on a tiny spec: real `train:screen` child trainers on a one-stage ladder, two offsets, no world
// trial. Two offsets are too few for a verdict, so the arm is `refused` and no finalist is exported.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { main } from '../scripts/train-tune.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-tune-slow-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const WORLD = {
    worldWidth: 2400,
    worldHeight: 1600,
    initialAgents: 40,
    maxAgents: 80,
    minAgents: 20,
    maxFood: 60,
    initialFood: 60,
    maturityTicks: 200,
    herdCount: 0,
    refugeCount: 0,
    wallGaps: 1,
    coldMarginWidth: 0,
};
const worldFile = join(root, 'world.json');
writeFileSync(worldFile, JSON.stringify(WORLD));
const ladder = join(root, 'ladder.json');
writeFileSync(ladder, JSON.stringify([{ name: 'one', config: worldFile, generations: 2, gate: [] }]));
const spec = join(root, 'spec.json');
writeFileSync(
    spec,
    JSON.stringify({
        curriculum: ladder,
        generations: 2,
        workersPerRun: 1,
        feasible: false,
        worldTrial: false,
        maxArms: 1,
        tuneOffsets: [0, 8],
        holdoutOffsets: [16, 24],
        train: { episodes: 2, ticks: 400, offerFrom: 100, checkpointEvery: 0 },
        tunables: [{ key: 'episodes', values: [3] }],
    }),
);

/** @returns {string} the repository's changed and untracked files */
const tree = () => execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });

describe('train:tune', () => {
    it(
        'screens the proposed arm in child trainers and writes only its results directory',
        async () => {
            const before = tree();
            const results = join(root, 'results');
            const logs = join(root, 'logs');
            const argv = ['--spec', spec, '--date', '2026-02-03', '--workers', '2', '--results', results];
            expect(await main([...argv, '--runs', join(root, 'runs'), '--log-dir', logs], () => {})).toBe(0);
            const out = join(results, '2026-02-03');
            expect(readdirSync(out).sort()).toEqual([
                'draft-experiment.json',
                'result.json',
                'summary.md',
                'tune',
                'tune.grid.json',
            ]);
            const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
            expect(result.arms).toMatchObject([
                { name: 'episodes-3', signature: 'train.episodes=3', tune: { verdict: 'refused' }, finalist: false },
            ]);
            expect(result.world).toBeNull();
            expect(readFileSync(join(logs, 'train-tune-2026-02-03.jsonl'), 'utf8')).toContain('TuneResult');
            expect(readdirSync(join(root, 'runs', 'tune')).sort()).toEqual(['base', 'episodes-3']);
            expect(tree()).toBe(before);
        },
        scaleTimeout(240000),
    );
});
