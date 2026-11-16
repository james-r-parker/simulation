import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initialState, nextStage } from '../js/evo/curriculum.js';
import { buildManifest, gitSha, manifestBase, writeManifest } from '../scripts/lib/train-manifest.mjs';
import { parseArgs } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-manifest-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

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
        const fresh = buildManifest(base, stages, state);
        expect(fresh).toMatchObject({ status: 'running', generationsDone: 0 });
        expect(fresh.stages).toEqual([
            { name: 'one', rulesHash: 'aaaa' },
            { name: 'two', rulesHash: 'bbbb' },
            { name: 'world', rulesHash: 'cccc' },
        ]);
        state = nextStage(state, { readings: {} }).state;
        state = nextStage(state, { readings: {} }).state;
        const held = buildManifest(base, stages, state);
        expect(held.stages[0]).toMatchObject({ name: 'one', generations: 2, passedAt: 2 });
        expect(held.stages[0].gate[0]).toMatchObject({ read: 'retention.all', value: 1, passed: true });
        expect(held.stages[1]).toEqual({ name: 'two', rulesHash: 'bbbb' });
    });

    it('writes manifest.json as JSON', () => {
        const base = manifestBase(parseArgs(['--generations', '1', '--out', 'x']), null);
        const path = writeManifest(root, buildManifest(base, stages, initialState(stages, 1)));
        expect(JSON.parse(readFileSync(path, 'utf8')).stages).toHaveLength(3);
    });
});
