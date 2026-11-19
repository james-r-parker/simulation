import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { championsDirFor, readChampionFiles, writeChampionFiles } from '../scripts/lib/champion-files.mjs';

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

describe('readChampionFiles', () => {
    it('reads the champion files in name order and skips the index and the skip cells', () => {
        const dir = join(root, 'read');
        mkdirSync(dir);
        writeFileSync(join(dir, 'b.json'), '{"name":"b"}');
        writeFileSync(join(dir, 'a.json'), '{"name":"a"}');
        writeFileSync(join(dir, 'index.json'), '{"champions":[]}');
        writeFileSync(join(dir, 'skip-cells.json'), '{}');
        writeFileSync(join(dir, 'notes.txt'), 'x');
        expect(readChampionFiles(dir)).toEqual([{ name: 'a' }, { name: 'b' }]);
    });

    it('fails loudly on a missing directory, an empty one and a file that is not JSON', () => {
        expect(() => readChampionFiles(join(root, 'nope'))).toThrow(/does not exist/);
        const empty = join(root, 'empty');
        mkdirSync(empty);
        expect(() => readChampionFiles(empty)).toThrow(/no champion \.json files/);
        const bad = join(root, 'bad');
        mkdirSync(bad);
        writeFileSync(join(bad, 'x.json'), '{oops');
        expect(() => readChampionFiles(bad)).toThrow(/x\.json/);
    });
});
