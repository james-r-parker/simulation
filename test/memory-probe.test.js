import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createSimLog } from '../js/sim/log.js';
import { loadChampions, main, parseArgs, runProbe } from '../scripts/memory-probe.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const root = mkdtempSync(join(tmpdir(), 'memory-probe-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * @param {string} name a directory name
 * @param {Record<string, any>[]} files the champion files to write into it
 * @returns {string} the directory
 */
function champions(name, files) {
    const dir = join(root, name);
    mkdirSync(dir);
    files.forEach((file, i) => writeFileSync(join(dir, `c${i}.json`), JSON.stringify(file)));
    return dir;
}

/** @type {Record<string, any>[]} */
const NO_RECORDS = [];

describe('parseArgs', () => {
    it('defaults to every scenario, 32 trials, seed 1 and the references', () => {
        expect(parseArgs([])).toMatchObject({
            champions: null,
            seed: 1,
            trials: 32,
            config: null,
            noReferences: false,
        });
        expect(parseArgs([]).scenarios).toEqual([
            'food-then-blind',
            'predator-out-of-view',
            'scent-after-sight-loss',
            'food-then-blind@600',
            'group-hunt',
        ]);
    });

    it('reads every flag', () => {
        const args = parseArgs([
            '--champions',
            'd',
            '--scenarios',
            'food-then-blind,group-hunt',
            '--seed',
            '3',
            '--trials',
            '5',
            '--config',
            'c.json',
            '--no-references',
        ]);
        expect(args).toEqual({
            champions: 'd',
            scenarios: ['food-then-blind', 'group-hunt'],
            seed: 3,
            trials: 5,
            config: 'c.json',
            noReferences: true,
        });
    });

    it.each([
        ['--scenarios', 'nap'],
        ['--trials', '0'],
        ['--bogus', '1'],
    ])('rejects %s %s with usage', (...argv) => {
        expect(() => parseArgs(argv)).toThrow(/usage: probe:memory/);
    });
});

describe('loadChampions', () => {
    const log = createSimLog((r) => NO_RECORDS.push(r), { level: 'debug' });

    it('loads every .json file in name order as a genome subject, with the champion specialisation and genome id', () => {
        const dir = champions('ok', [
            { ...makeChampionFile('b', 2, { specialisation: 1 }), genomeId: 77 },
            makeChampionFile('a', 1),
        ]);
        const subjects = loadChampions(dir, { config: {}, log });
        expect(subjects.map((s) => [s.name, s.spec, s.id])).toEqual([
            ['b', 1, 77],
            ['a', 0, 0],
        ]);
        expect(subjects[0].weights).toBeInstanceOf(Float32Array);
        expect(subjects[0].act).toBeNull();
    });

    it('refuses a directory with no champion files', () => {
        expect(() => loadChampions(champions('empty', []), { config: {}, log })).toThrow(
            '--champions: no .json champion files in',
        );
    });

    it('logs probe.layout with the expected and actual hidden size and throws for a champion of another size', () => {
        const file = makeChampionFile('wide', 1);
        file.layout.brainHidden = 48;
        const records = /** @type {Record<string, any>[]} */ ([]);
        const capture = createSimLog((r) => records.push(r), { level: 'debug' });
        expect(() => loadChampions(champions('wide', [file]), { config: {}, log: capture })).toThrow(
            'c0.json: champion.layout.brainHidden: expected 32, got 48',
        );
        expect(records).toEqual([
            {
                level: 'error',
                event: 'probe.layout',
                file: 'c0.json',
                expected: { layout: 'pooled-v2', brainHidden: 32, inputCount: 81 },
                actual: { layout: null, brainHidden: 48, inputCount: 81 },
            },
        ]);
    });
});

describe('main', () => {
    it('exits non-zero, naming the file, for a champion that does not fit the layout', async () => {
        const file = makeChampionFile('wide', 1);
        file.layout.brainHidden = 48;
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const code = await main(['--champions', champions('bad', [file])], { logDir: join(root, 'logs') });
        expect(code).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('c0.json: champion.layout.brainHidden'));
        const log = readFileSync(join(root, 'logs', 'probe-1x32.jsonl'), 'utf8');
        expect(log).toContain('"event":"probe.layout"');
        error.mockRestore();
    });
});

describe('main on success', () => {
    it('prints each subject to the console and exits 0', async () => {
        const out = vi.spyOn(console, 'log').mockImplementation(() => {});
        const code = await main(['--scenarios', 'food-then-blind', '--trials', '1'], { logDir: join(root, 'logs4') });
        const printed = out.mock.calls.map((call) => String(call[0])).join('\n');
        out.mockRestore();
        expect(code).toBe(0);
        expect(printed).toContain('reference memoryless');
        expect(printed).toContain('reference memory-storing');
    });
});

describe('runProbe', () => {
    it('runs without a print function, and still logs the trials', async () => {
        const args = parseArgs(['--scenarios', 'food-then-blind', '--trials', '1']);
        const scores = await runProbe(args, { logDir: join(root, 'logs5') });
        expect(scores).toEqual({});
        const log = readFileSync(join(root, 'logs5', 'probe-1x1.jsonl'), 'utf8')
            .trim()
            .split('\n');
        expect(log).toHaveLength(2 * 3);
    });

    it('prints both references per scenario and logs a ProbeTrial for each trial', async () => {
        const lines = /** @type {string[]} */ ([]);
        const args = parseArgs(['--scenarios', 'food-then-blind', '--trials', '2']);
        await runProbe(args, { logDir: join(root, 'logs2'), print: (line) => lines.push(line) });
        const text = lines.join('\n');
        expect(text).toContain('reference memoryless');
        expect(text).toContain('reference memory-storing');
        const log = readFileSync(join(root, 'logs2', 'probe-1x2.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(log).toHaveLength(2 * 2 * 3);
        expect(log[0]).toMatchObject({ event: 'ProbeTrial', scenario: 'food-then-blind', control: 'intact', trial: 0 });
    });

    it('prints the champion set scores and leaves the references out with --no-references', async () => {
        const dir = champions('set', [makeChampionFile('a', 1), makeChampionFile('b', 2)]);
        const lines = /** @type {string[]} */ ([]);
        const args = parseArgs([
            '--champions',
            dir,
            '--scenarios',
            'food-then-blind',
            '--trials',
            '1',
            '--no-references',
        ]);
        const scores = await runProbe(args, { logDir: join(root, 'logs3'), print: (line) => lines.push(line) });
        expect(Object.keys(scores).sort()).toEqual(['probe.food_reach', 'probe.memory_gain.food-then-blind']);
        expect(lines.some((line) => line.startsWith('champion a'))).toBe(true);
        expect(lines.some((line) => line.includes('reference'))).toBe(false);
        expect(lines.at(-1)).toMatch(/^probe\.memory_gain\.food-then-blind -?\d\.\d{3} \(mean over 2 champions\)$/);
    });
});
