import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseArgs, runTraining } from '../scripts/train.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-pool-slow-'));
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

/**
 * @param {string} name the curriculum file name
 * @param {number | undefined} pool the `pool` share of the second stage (none: no field)
 * @returns {string} a two-stage fixed curriculum file whose second stage has the share
 */
function curriculum(name, pool) {
    const path = join(root, `${name}.json`);
    const second = { name: 'world', config: null, generations: 3, ...(pool === undefined ? {} : { pool }) };
    writeFileSync(path, JSON.stringify([{ name: 'one', config: world, generations: 1 }, second]));
    return path;
}

/**
 * @param {string} name the output directory name
 * @param {string} file the curriculum file
 * @param {string} workers the pool size
 * @returns {Promise<void>} a 4-generation run with a checkpoint every generation
 */
async function run(name, file, workers) {
    const args = parseArgs([
        ...['--generations', '4', '--curriculum', file, '--checkpoint-every', '1', '--workers', workers],
        ...['--episodes', '3', '--ticks', '2500', '--offer-from', '500', '--out', join(root, name)],
    ]);
    await runTraining(args, { drillTrials: 2, gateTrials: 2 });
}

/**
 * @param {string} name the output directory name
 * @param {number} g the generation index
 * @returns {string} the archive file's text
 */
function archiveText(name, g) {
    return readFileSync(join(root, name, `archive-${g}.json`), 'utf8');
}

describe('a stage with an opponent pool', () => {
    it(
        'writes the archives a run without the option writes when the share is 0',
        async () => {
            await run('plain', curriculum('plain', undefined), '2');
            await run('zero', curriculum('zero', 0), '2');
            for (const g of [0, 1, 2, 3]) {
                expect(archiveText('zero', g)).toBe(archiveText('plain', g));
            }
            expect(JSON.parse(archiveText('zero', 3))).not.toHaveProperty('pool');
        },
        scaleTimeout(300000),
    );

    it(
        'snapshots the archive, logs TrainPool, records the pool index and writes identical archives with 1 and 2 workers',
        async () => {
            const file = curriculum('shared', 0.5);
            await run('p1', file, '1');
            await run('p2', file, '2');
            expect(archiveText('p1', 3)).toBe(archiveText('p2', 3));
            const json = JSON.parse(archiveText('p1', 3));
            expect(json.pool.checkpoints).toBe(4);
            expect(json.pool.entries.map((/** @type {any} */ e) => e.generation)).toEqual([2, 4]);
            const events = readFileSync(join(root, 'p1', 'train.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line))
                .filter((r) => r.event === 'TrainPool');
            expect(events.map((r) => [r.generation, r.snapshots])).toEqual([
                [2, 1],
                [4, 2],
            ]);
        },
        scaleTimeout(300000),
    );

    it(
        'resumes with the pool rebuilt from the archive files beside the resumed one',
        async () => {
            const file = curriculum('resume', 0.5);
            const args = (/** @type {string} */ name, /** @type {string[]} */ more) =>
                parseArgs([
                    ...['--curriculum', file, '--checkpoint-every', '1', '--workers', '2', '--episodes', '3'],
                    ...['--ticks', '2500', '--offer-from', '500', '--out', join(root, name), ...more],
                ]);
            await runTraining(args('part', ['--generations', '2']), { drillTrials: 2, gateTrials: 2 });
            const partial = join(root, 'part', 'archive-1.json');
            expect(JSON.parse(readFileSync(partial, 'utf8')).pool.entries).toHaveLength(1);
            await runTraining(args('rest', ['--generations', '4', '--resume', partial]), {
                drillTrials: 2,
                gateTrials: 2,
            });
            expect(JSON.parse(archiveText('rest', 3)).pool.entries.map((/** @type {any} */ e) => e.generation)).toEqual(
                [2, 4],
            );
        },
        scaleTimeout(300000),
    );
});
