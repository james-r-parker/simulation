// `train:profile` on a real two-generation run: the TrainTiming records the trainer logs and the report read from them.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { main } from '../scripts/train-profile.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-profile-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const world = join(root, 'world.json');
writeFileSync(
    world,
    JSON.stringify({
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
    }),
);

describe('train:profile', () => {
    it(
        'trains two generations, logs one TrainTiming each and prints their shares',
        async () => {
            const out = join(root, 'run');
            const args = ['--generations', '2', '--config', world, '--episodes', '3', '--ticks', '2500'];
            /** @type {string[]} */
            const lines = [];
            const code = await main(
                [
                    ...args,
                    '--offer-from',
                    '500',
                    '--workers',
                    '1',
                    '--checkpoint-every',
                    '0',
                    '--scratch',
                    '--out',
                    out,
                ],
                (line) => lines.push(line),
            );
            expect(code).toBe(0);
            const records = readFileSync(join(out, 'train.jsonl'), 'utf8')
                .split('\n')
                .filter((line) => line !== '')
                .map((line) => JSON.parse(line))
                .filter((r) => r.event === 'TrainTiming');
            expect(records).toHaveLength(2);
            for (const r of records) {
                expect(r).toMatchObject({ workers: 1 });
                expect(r.episodeSeconds).toBeGreaterThan(0);
                expect(r.busySeconds).toBeGreaterThan(0);
                expect(r.checkpointSeconds).toBeGreaterThanOrEqual(0);
                expect(r.saveSeconds).toBeGreaterThanOrEqual(0);
            }
            expect(lines[0]).toBe('workers 1');
            expect(lines.at(-1)).toMatch(/^all\s+2\s/);
            expect(await main(['--from', out], () => {})).toBe(0);
            expect(await main([...args, '--workers', '1', '--scratch', '--out', out], () => {})).toBe(1);
        },
        scaleTimeout(60_000),
    );

    it('exits 1 on a run directory with no log', async () => {
        expect(await main(['--from', join(root, 'missing')], () => {})).toBe(1);
    });
});
