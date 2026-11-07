import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseArgs, runTraining } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-slow-'));
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
const fileA = join(root, 'a.json');
const fileB = join(root, 'b.json');
writeFileSync(fileA, JSON.stringify(WORLD));
writeFileSync(fileB, JSON.stringify({ ...WORLD, maxFood: 40, initialFood: 40 }));
const curriculum = join(root, 'curriculum.json');
writeFileSync(
    curriculum,
    JSON.stringify([
        { name: 'one', config: fileA, generations: 1 },
        { name: 'two', config: fileB },
    ]),
);

/**
 * @param {string} name the output directory name
 * @param {string[]} extra more arguments
 * @returns {string[]} arguments for a small run into `name`
 */
function small(name, extra) {
    return ['--episodes', '3', '--ticks', '2500', '--offer-from', '500', '--out', join(root, name), ...extra];
}

/**
 * @param {string} name the output directory name
 * @param {number} g the generation
 * @returns {string} the archive file's text
 */
function archiveText(name, g) {
    return readFileSync(join(root, name, `archive-${g}.json`), 'utf8');
}

describe('npm run train', () => {
    it('writes identical archives with one and two workers, with offers merged', async () => {
        await runTraining(
            parseArgs([
                '--generations',
                '2',
                '--config',
                fileA,
                '--checkpoint-every',
                '0',
                ...small('w1', ['--workers', '1']),
            ]),
        );
        await runTraining(
            parseArgs([
                '--generations',
                '2',
                '--config',
                fileA,
                '--checkpoint-every',
                '0',
                ...small('w2', ['--workers', '2']),
            ]),
        );
        expect(archiveText('w1', 1)).toBe(archiveText('w2', 1));
        expect(JSON.parse(archiveText('w1', 1)).cells.length).toBeGreaterThan(0);
    }, 120000);

    it('writes the same archives with checkpoints as without, and a curve row', async () => {
        const args = ['--generations', '2', '--config', fileA, '--workers', '2'];
        await runTraining(parseArgs([...args, '--checkpoint-every', '1', ...small('cp', [])]), { drillTrials: 2 });
        expect(archiveText('cp', 1)).toBe(archiveText('w1', 1));
        const rows = readFileSync(join(root, 'cp', 'curve.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(rows.map((r) => r.generation)).toEqual([1, 2]);
        expect(rows[1]).toHaveProperty('eval.food_energy_per_1k');
    }, 240000);

    it('switches config at the stage boundary and resumes to the same archive', async () => {
        const base = ['--curriculum', curriculum, '--checkpoint-every', '0', '--workers', '2'];
        await runTraining(parseArgs(['--generations', '3', ...base, ...small('full', [])]));
        const log = readFileSync(join(root, 'full', 'train.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        const stages = log.filter((r) => r.event === 'TrainStage').map((r) => [r.stage, r.generation]);
        expect(stages).toEqual([
            ['one', 0],
            ['two', 1],
        ]);
        const hashes = log.filter((r) => r.event === 'TrainStage').map((r) => r.rulesHash);
        expect(hashes[0]).not.toBe(hashes[1]);
        expect(
            JSON.parse(archiveText('full', 2)).stages.map((/** @type {any} */ s) => [s.name, s.generations]),
        ).toEqual([
            ['one', 1],
            ['two', 2],
        ]);

        await runTraining(parseArgs(['--generations', '2', ...base, ...small('part', [])]));
        await runTraining(
            parseArgs([
                '--generations',
                '3',
                ...base,
                '--resume',
                join(root, 'part', 'archive-1.json'),
                ...small('rest', []),
            ]),
        );
        expect(archiveText('rest', 2)).toBe(archiveText('full', 2));
    }, 240000);

    it('refuses to resume an archive whose stage rules differ, naming the field', async () => {
        const args = parseArgs([
            '--generations',
            '3',
            '--config',
            fileB,
            '--resume',
            join(root, 'full', 'archive-0.json'),
            ...small('bad', []),
        ]);
        await expect(runTraining(args)).rejects.toThrow(/archive\.rulesHash/);
    }, 60000);
});
