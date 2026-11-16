import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initialState, nextStage } from '../js/evo/curriculum.js';
import {
    buildManifest,
    gitSha,
    manifestBase,
    partitionManifests,
    startLedger,
    writeManifest,
} from '../scripts/lib/train-manifest.mjs';
import { parseArgs } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-manifest-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const PARTS = { manifests: [], uses: [] };
const GATE = [{ read: 'retention.all', min: 1 }];
const stages = /** @type {any[]} */ ([
    { name: 'one', rulesHash: 'aaaa', gate: GATE, minGenerations: 1, maxGenerations: 3 },
    { name: 'two', rulesHash: 'bbbb', gate: GATE, minGenerations: 1, maxGenerations: 3 },
    { name: 'world', rulesHash: 'cccc' },
]);

describe('manifestBase', () => {
    it('records the sha, the command line, the curriculum file hash and the options that decide the result', () => {
        const file = join(root, 'curriculum.json');
        writeFileSync(file, '[{"name":"a","config":null}]');
        const argv = ['--generations', '4', '--out', 'x', '--curriculum', file, '--seed-offset', '64'];
        const base = manifestBase(parseArgs(argv), argv);
        expect(base.gitSha).toMatch(/^[0-9a-f]{40}$/);
        expect(base.commandLine).toEqual(argv);
        expect(base.curriculum).toEqual({
            file,
            hash: createHash('sha256').update(readFileSync(file)).digest('hex'),
        });
        expect(base.options).toMatchObject({ generations: 4, seedOffset: 64, until: null, resume: null });
        expect(manifestBase(parseArgs(['--generations', '1', '--out', 'x']), null).curriculum).toBeNull();
        expect(gitSha()).toBe(base.gitSha);
    });
});

describe('buildManifest', () => {
    it('lists every stage with its rulesHash, and passes with their generation and gate readings', () => {
        const base = manifestBase(parseArgs(['--generations', '9', '--out', 'x']), null);
        let state = initialState(stages, 9);
        const fresh = buildManifest(base, stages, state, PARTS);
        expect(fresh).toMatchObject({ status: 'running', generationsDone: 0 });
        expect(fresh.stages).toEqual([
            { name: 'one', rulesHash: 'aaaa' },
            { name: 'two', rulesHash: 'bbbb' },
            { name: 'world', rulesHash: 'cccc' },
        ]);
        state = nextStage(state, { readings: {} }).state;
        state = nextStage(state, { readings: {} }).state;
        const held = buildManifest(base, stages, state, PARTS);
        expect(held.stages[0]).toMatchObject({ name: 'one', generations: 2, passedAt: 2 });
        expect(held.stages[0].gate[0]).toMatchObject({ read: 'retention.all', value: 1, passed: true });
        expect(held.stages[1]).toEqual({ name: 'two', rulesHash: 'bbbb' });
    });

    it('writes manifest.json as JSON', () => {
        const base = manifestBase(parseArgs(['--generations', '1', '--out', 'x']), null);
        const path = writeManifest(root, buildManifest(base, stages, initialState(stages, 1), PARTS));
        expect(JSON.parse(readFileSync(path, 'utf8')).stages).toHaveLength(3);
    });
});

describe('seed partitions in the manifest', () => {
    it('reads training and validation seeds that do not overlap', () => {
        const manifests = partitionManifests([4579, 996961]);
        expect(manifests.map((m) => [m.partition, m.start, m.count])).toEqual([
            ['training', 0, 1_000_000],
            ['validation', 1_000_000, 64],
        ]);
        expect(partitionManifests([1]).map((m) => m.scenarioHash)).not.toEqual(manifests.map((m) => m.scenarioHash));
    });

    it('starts a ledger with a train use, and a resumed run adds a resume use to the uses its manifest holds', () => {
        expect(startLedger(null)).toEqual([{ purpose: 'train', partition: 'training' }]);
        const dir = join(root, 'resumed');
        mkdirSync(dir);
        const earlier = [
            { purpose: 'train', partition: 'training' },
            { purpose: 'gate', partition: 'validation', generation: 2 },
        ];
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ partitions: { manifests: [], uses: earlier } }));
        const ledger = startLedger(join(dir, 'archive-1.json'));
        expect(ledger.map((u) => u.purpose)).toEqual(['train', 'gate', 'resume']);
        expect(startLedger(join(root, 'no-manifest', 'archive-1.json')).map((u) => u.purpose)).toEqual(['resume']);
    });
});
