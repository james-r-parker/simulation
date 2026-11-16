import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { createPool } from '../js/evo/opponent-pool.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { createConfig } from '../js/sim/config.js';
import { loadPool, poolAfterCheckpoint, poolIndex, taskPool } from '../scripts/lib/train-pool.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-pool-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const config = createConfig({});
const archive = createTrainerArchive(config);

describe('poolAfterCheckpoint', () => {
    it('takes a periodic snapshot every second checkpoint and a stage-pass snapshot named for the stage that passed', () => {
        let pool = createPool();
        const taken = [];
        for (const stagePassed of [null, null, 'hunt', null]) {
            const next = poolAfterCheckpoint(pool, {
                archive,
                generation: pool.checkpoints + 1,
                stage: 'evade',
                stagePassed,
            });
            pool = next.pool;
            taken.push(next.taken);
        }
        expect(taken).toEqual([null, 'periodic', 'stage-pass', 'periodic']);
        expect(pool.entries.map((e) => [e.stage, e.kind])).toEqual([
            ['evade', 'periodic'],
            ['hunt', 'stage-pass'],
            ['evade', 'periodic'],
        ]);
    });
});

describe('taskPool', () => {
    const { pool } = poolAfterCheckpoint(createPool(), { archive, generation: 1, stage: 's', stagePassed: 'hunt' });

    it('is undefined at a share of 0 or none, or with an empty pool, so the task is the one a run without the option has', () => {
        expect(taskPool(pool, 0)).toBeUndefined();
        expect(taskPool(pool, undefined)).toBeUndefined();
        expect(taskPool(createPool(), 0.5)).toBeUndefined();
    });

    it('carries the snapshots and the share otherwise', () => {
        const task = taskPool(pool, 0.2);
        expect(task?.share).toBe(0.2);
        expect(task?.snapshots).toHaveLength(1);
    });
});

describe('poolIndex and loadPool', () => {
    it('rebuilds the pool from the archive files beside the resumed one, and refuses a missing file', () => {
        writeFileSync(
            join(root, 'archive-3.json'),
            `${JSON.stringify({ ...encodeArchive(archive, config), generation: 4 })}\n`,
        );
        const entries = [{ generation: 4, stage: 'hunt', kind: /** @type {const} */ ('stage-pass') }];
        const pool = loadPool(join(root, 'archive-9.json'), { checkpoints: 5, entries });
        expect(pool.checkpoints).toBe(5);
        expect(poolIndex(pool)).toEqual({ checkpoints: 5, entries });
        const missing = {
            checkpoints: 1,
            entries: [{ generation: 9, stage: 'x', kind: /** @type {const} */ ('periodic') }],
        };
        expect(() => loadPool(join(root, 'archive-9.json'), missing)).toThrow(/archive-8\.json/);
        expect(loadPool('anything', null)).toEqual(createPool());
    });
});
