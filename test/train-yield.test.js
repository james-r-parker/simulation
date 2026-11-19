import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, parseArgs } from '../scripts/train-yield.mjs';
import { expandDirs, loadRuns, readRunDir } from '../scripts/lib/yield-files.mjs';
import { formatRuns, formatYield } from '../scripts/lib/yield-report.mjs';
import { ladderYield } from '../js/evo/ladder-yield.js';
import { row, writeRun } from './helpers/yield-fixture.js';

const root = mkdtempSync(join(tmpdir(), 'train-yield-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const stalled = (/** @type {number} */ offset) => ({
    offset,
    stages: [{ name: 'nursery', passedAt: 10 }, { name: 'hunt' }],
    rows: [row('nursery', 3600, 1), row('hunt', 7200, 0.25)],
});

describe('parseArgs', () => {
    it('takes directories and --out, and refuses none, an unknown flag or a bare --out', () => {
        expect(parseArgs(['a', 'b*', '--out', 'x.json'])).toEqual({ patterns: ['a', 'b*'], out: 'x.json' });
        expect(parseArgs(['a'])).toEqual({ patterns: ['a'], out: null });
        expect(() => parseArgs([])).toThrow(/usage/);
        expect(() => parseArgs(['a', '--nope'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['a', '--out'])).toThrow(/--out needs a path/);
    });
});

describe('the run files', () => {
    it('expands a glob, keeps a plain directory and refuses a pattern that matches nothing', () => {
        const a = writeRun(join(root, 'glob', 'o0'), stalled(0));
        const b = writeRun(join(root, 'glob', 'o8'), stalled(8));
        expect(expandDirs([join(root, 'glob', 'o*')])).toEqual([a, b]);
        expect(expandDirs([a, a])).toEqual([a]);
        expect(() => expandDirs([join(root, 'glob', 'x*')])).toThrow(/no run directory/);
        expect(() => expandDirs([join(root, 'missing')])).toThrow(/no run directory/);
    });

    it('reads a run with no curve as no rows, and refuses a directory with no manifest', () => {
        const dir = writeRun(join(root, 'bare'), { offset: 0, stages: [{ name: 'a', passedAt: 4 }] });
        expect(readRunDir(dir).rows).toEqual([]);
        expect(() => readRunDir(join(root, 'bare-missing'))).toThrow(/no manifest/);
    });

    it('loads each run`s yield and the ladder`s longest stage list', () => {
        const short = writeRun(join(root, 'load', 'o0'), { offset: 0, stages: [{ name: 'nursery' }] });
        const long = writeRun(join(root, 'load', 'o8'), stalled(8));
        const { runs, stages } = loadRuns([short, long]);
        expect(stages).toEqual(['nursery', 'hunt']);
        expect(runs.map((r) => [r.dir, r.offset, r.score])).toEqual([
            [short, 0, 0],
            [long, 8, 1.25],
        ]);
    });
});

describe('the report', () => {
    it('prints a line per stage and a total, and a line per run', () => {
        const { runs, stages } = loadRuns([writeRun(join(root, 'report', 'o0'), stalled(0))]);
        const lines = formatYield(ladderYield(runs, stages));
        expect(lines[0]).toMatch(/^stage\s+passed\s+median gens\s+cpu h \/ pass$/);
        expect(lines[1]).toMatch(/^nursery\s+100%\s+10\s+1\.00$/);
        expect(lines[2]).toMatch(/^hunt\s+0%\s+-\s+-$/);
        expect(lines[3]).toBe('runs 1, mean score 1.25, cpu 2.0 h');
        expect(formatRuns(runs)[1]).toMatch(/^0\s+1\s+0\.250\s+1\.250\s+2\.00$/);
    });
});

describe('train:yield', () => {
    it('prints the table and writes the JSON', async () => {
        writeRun(join(root, 'cli', 'o0'), stalled(0));
        writeRun(join(root, 'cli', 'o8'), {
            offset: 8,
            stages: [{ name: 'nursery' }],
            rows: [row('nursery', 600, 0.5)],
        });
        const out = join(root, 'yield.json');
        /** @type {string[]} */
        const lines = [];
        const code = await main([join(root, 'cli', 'o*'), '--out', out], (line) => lines.push(line));
        expect(code).toBe(0);
        expect(lines.join('\n')).toContain('mean score 0.88');
        const json = JSON.parse(readFileSync(out, 'utf8'));
        expect(json).toMatchObject({ runs: 2 });
        expect(json.perRun).toHaveLength(2);
        expect(json.stages[0]).toMatchObject({ stage: 'nursery', passShare: 0.5 });
    });

    it('exits 1 with a message when no run matches', async () => {
        expect(await main([join(root, 'nothing*')], () => {})).toBe(1);
    });
});
