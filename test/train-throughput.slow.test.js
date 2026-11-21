// Phase 5 of docs/designs/training-loop.md: the throughput changes (T27 to T32) must not move a byte of what a run writes.
// The fixture is a small gated ladder with real drills; its archives and its curve (minus the timing columns) are pinned
// by hash and must match across worker counts.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { parseArgs, runTraining } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-throughput-'));
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
const world = join(root, 'world.json');
writeFileSync(world, JSON.stringify(WORLD));
const ladder = join(root, 'ladder.json');
writeFileSync(
    ladder,
    JSON.stringify([
        { name: 'one', config: world, minGenerations: 1, maxGenerations: 3, gate: [{ read: 'retention.all', min: 1 }] },
        { name: 'world', config: null, pool: 0.5 },
    ]),
);

/** The columns of a curve row that time the run, which differ from run to run. */
const TIMING = ['wallSeconds', 'cpuShare', 'cpuSeconds', 'workers'];

/**
 * @param {string} name the output directory name
 * @param {number} workers the pool size
 * @returns {Promise<{archives: string, curve: string}>} the SHA-256 of every archive file and of the curve without its timing columns
 */
async function run(name, workers) {
    const out = join(root, name);
    const argv = [
        '--generations',
        '4',
        '--curriculum',
        ladder,
        '--checkpoint-every',
        '1',
        '--workers',
        String(workers),
    ];
    const small = ['--episodes', '3', '--ticks', '2500', '--offer-from', '500', '--out', out];
    await runTraining(parseArgs([...argv, ...small]), { drillTrials: 2, gateTrials: 2 });
    const files = readdirSync(out)
        .filter((f) => /^archive-\d+\.json$/.test(f))
        .sort();
    const archives = files.map((f) => readFileSync(join(out, f), 'utf8')).join('');
    const rows = readFileSync(join(out, 'curve.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
    for (const row of rows) {
        for (const key of TIMING) {
            delete row[key];
        }
    }
    const sha = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex');
    return { archives: sha(archives), curve: sha(rows.map((r) => JSON.stringify(r)).join('\n')) };
}

/** What the run wrote before T27 to T32 (recorded on the unchanged code). */
const PINNED = {
    archives: '04c53ffd5004f6957ea4a0bf811202320ea5f9ca96604094e8f99d3080716847',
    curve: 'fdc669eefa332c14fa321c5b5d16efad7fe0b8fa4f17f77e3f380071138c8864',
};

describe('archive files at checkpoints only', () => {
    /**
     * @param {string} name the output directory name
     * @param {number} every the checkpoint interval
     * @returns {Promise<string[]>} the archive file names the 5-generation run wrote
     */
    async function files(name, every) {
        const out = join(root, name);
        const argv = ['--generations', '5', '--config', world, '--checkpoint-every', String(every), '--workers', '2'];
        const small = ['--episodes', '3', '--ticks', '2500', '--offer-from', '500', '--out', out];
        await runTraining(parseArgs([...argv, ...small]), { drillTrials: 2 });
        return readdirSync(out)
            .filter((f) => /^archive-\d+\.json$/.test(f))
            .sort();
    }

    it(
        'writes the checkpoint generations and the last, byte-identical to the files a checkpoint every generation writes',
        async () => {
            const sparse = await files('every2', 2);
            const dense = await files('every1', 1);
            expect(sparse).toEqual(['archive-1.json', 'archive-3.json', 'archive-4.json']);
            expect(dense).toHaveLength(5);
            for (const f of sparse) {
                expect(readFileSync(join(root, 'every2', f), 'utf8')).toBe(
                    readFileSync(join(root, 'every1', f), 'utf8'),
                );
            }
        },
        scaleTimeout(180000),
    );
});

describe('trainer throughput changes', () => {
    it(
        'write the archives and curve they always wrote, with 1 and 2 workers',
        async () => {
            const one = await run('w1', 1);
            const two = await run('w2', 2);
            expect(two).toEqual(one);
            expect(one).toEqual(PINNED);
        },
        scaleTimeout(180000),
    );
});
