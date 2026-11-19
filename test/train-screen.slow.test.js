// The ladder screen end to end on a tiny ladder: real `scripts/train.mjs` child processes, two arms, two offsets.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { main } from '../scripts/train-screen.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-screen-slow-'));
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
writeFileSync(
    ladder,
    JSON.stringify([
        { name: 'one', config: worldFile, generations: 1 },
        { name: 'two', config: null },
    ]),
);
const grid = join(root, 'tiny.grid.json');
writeFileSync(
    grid,
    JSON.stringify({
        curriculum: ladder,
        offsets: [0, 8],
        generations: 2,
        workersPerRun: 1,
        train: { episodes: 2, ticks: 400, offerFrom: 100, checkpointEvery: 0 },
        arms: { base: {}, longer: { stages: { one: { generations: 2 } } } },
    }),
);

describe('train:screen', () => {
    it(
        'trains every arm on every offset in child processes, writes the yield and verdicts, and reuses the runs',
        async () => {
            const out = join(root, 'out');
            const argv = ['--grid', grid, '--out', out, '--workers', '2', '--log-dir', join(root, 'logs')];
            /** @type {string[]} */
            const lines = [];
            expect(await main(argv, (l) => lines.push(l))).toBe(0);
            for (const arm of ['base', 'longer']) {
                for (const offset of [0, 8]) {
                    const manifest = JSON.parse(readFileSync(join(out, arm, `o${offset}`, 'manifest.json'), 'utf8'));
                    expect(manifest).toMatchObject({ status: 'done', options: { seedOffset: offset, generations: 2 } });
                }
            }
            const yielded = JSON.parse(readFileSync(join(out, 'yield.json'), 'utf8'));
            expect(yielded.base).toMatchObject({ runs: 2, stages: [{ stage: 'one' }, { stage: 'two' }] });
            const verdicts = JSON.parse(readFileSync(join(out, 'verdicts.json'), 'utf8'));
            expect(verdicts.arms.longer.verdict).toBe('refused');
            expect(lines.join('\n')).toContain('# Ladder screen (reference: base)');
            const events = (/** @type {string} */ text) =>
                text
                    .trim()
                    .split('\n')
                    .map((l) => JSON.parse(l));
            const log = events(readFileSync(join(root, 'logs', 'train-screen-tiny.jsonl'), 'utf8'));
            expect(log.filter((r) => r.event === 'TrainScreenRun' && !r.reused)).toHaveLength(4);
            expect(await main(argv, () => {})).toBe(0);
            const after = events(readFileSync(join(root, 'logs', 'train-screen-tiny.jsonl'), 'utf8'));
            expect(after.filter((r) => r.event === 'TrainScreenRun' && r.reused)).toHaveLength(4);
        },
        scaleTimeout(240000),
    );
});
