import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { championsDirFor, writeChampionFiles } from '../scripts/lib/champion-files.mjs';

const root = mkdtempSync(join(tmpdir(), 'champion-files-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('championsDirFor', () => {
    it('puts the champions beside the report, named after it', () => {
        expect(championsDirFor('evals/results/run.json')).toBe('evals/results/run-champions');
        expect(championsDirFor('out')).toBe('out-champions');
    });
});

describe('writeChampionFiles', () => {
    it('writes one JSON file per champion from every seed and returns the count', () => {
        const dir = join(root, 'a');
        const results = [
            { champions: [{ name: 's1-a', v: 1 }] },
            { champions: [{ name: 's2-a' }, { name: 's2-b' }] },
            {},
        ];
        expect(writeChampionFiles(results, dir)).toBe(3);
        expect(readdirSync(dir).sort()).toEqual(['s1-a.json', 's2-a.json', 's2-b.json']);
        expect(JSON.parse(readFileSync(join(dir, 's1-a.json'), 'utf8'))).toEqual({ name: 's1-a', v: 1 });
    });

    it('creates the directory even when no seed has a champion', () => {
        const dir = join(root, 'b');
        expect(writeChampionFiles([{ champions: [] }], dir)).toBe(0);
        expect(readdirSync(dir)).toEqual([]);
    });
});
