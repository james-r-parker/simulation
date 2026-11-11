import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../scripts/lib/worker-pool.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    runPool: vi.fn(async () => {
        throw new Error('task 1 failed: boom');
    }),
}));

const { parseArgs, runTraining } = await import('../scripts/train.mjs');

const root = mkdtempSync(join(tmpdir(), 'train-failure-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('runTraining when an episode fails', () => {
    it('logs TrainEpisodeFailed with the generation, episode and its seed, then rethrows', async () => {
        const out = join(root, 'run');
        const args = parseArgs(['--generations', '1', '--episodes', '2', '--out', out, '--workers', '1']);
        await expect(runTraining(args)).rejects.toThrow('task 1 failed: boom');
        const rows = readFileSync(join(out, 'train.jsonl'), 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l));
        expect(rows[0]).toMatchObject({
            event: 'RunConfig',
            tool: 'train',
            policy: null,
            seeds: null,
            generations: 1,
            episodes: 2,
        });
        expect(rows[0].configHash).toMatch(/^[0-9a-f]+$/);
        expect(rows[0].stages).toHaveLength(1);
        const failed = rows.find((r) => r.event === 'TrainEpisodeFailed');
        expect(failed).toMatchObject({ generation: 0, episode: 1, message: 'task 1 failed: boom' });
        expect(failed.seed).toBeTypeOf('number');
    });

    it('logs episode -1 and a null seed when the failure names no task', async () => {
        const { runPool } = await import('../scripts/lib/worker-pool.mjs');
        vi.mocked(runPool).mockRejectedValueOnce(new Error('pool died'));
        const out = join(root, 'run2');
        const args = parseArgs(['--generations', '1', '--episodes', '2', '--out', out, '--workers', '1']);
        await expect(runTraining(args)).rejects.toThrow('pool died');
        const rows = readFileSync(join(out, 'train.jsonl'), 'utf8').split('\n').filter(Boolean);
        const failed = rows.map((l) => JSON.parse(l)).find((r) => r.event === 'TrainEpisodeFailed');
        expect([failed.episode, failed.seed]).toEqual([-1, null]);
    });
});
