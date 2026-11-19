import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, parseArgs, runTrainScreen } from '../scripts/train-screen.mjs';
import { fakeTrain } from './helpers/fake-train.js';

const root = mkdtempSync(join(tmpdir(), 'train-screen-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const LADDER = [
    { name: 'one', config: null, generations: 2 },
    { name: 'two', config: null },
];
const ladderFile = join(root, 'ladder.json');
writeFileSync(ladderFile, JSON.stringify(LADDER));

/**
 * @param {string} name the grid's name
 * @param {number} count offsets, 0, 8, ...
 * @returns {string} the grid file
 */
function gridFile(name, count) {
    const file = join(root, `${name}.grid.json`);
    const offsets = Array.from({ length: count }, (_, i) => i * 8);
    writeFileSync(
        file,
        JSON.stringify({
            curriculum: ladderFile,
            offsets,
            generations: 6,
            workersPerRun: 4,
            reference: 'plain',
            arms: { plain: {}, better: { train: { episodes: 3 } } },
        }),
    );
    return file;
}

/** @param {string} name the grid's name @param {number} count offsets @returns {ReturnType<typeof parseArgs>} args */
const args = (name, count) =>
    parseArgs([
        '--grid',
        gridFile(name, count),
        '--out',
        join(root, name),
        '--workers',
        '8',
        '--log-dir',
        join(root, 'logs'),
    ]);

describe('parseArgs', () => {
    it('needs --grid and reads the rest', () => {
        expect(parseArgs(['--grid', 'g.json'])).toMatchObject({
            grid: 'g.json',
            out: null,
            runs: null,
            workers: null,
            force: false,
        });
        expect(
            parseArgs(['--grid', 'g', '--out', 'o', '--runs', 'r', '--workers', '4', '--force', '--log-dir', 'l']),
        ).toMatchObject({
            out: 'o',
            runs: 'r',
            workers: 4,
            force: true,
            logDir: 'l',
        });
        expect(() => parseArgs([])).toThrow(/--grid is required/);
        expect(() => parseArgs(['--grid', 'g', '--workers', '0'])).toThrow(/--workers/);
        expect(() => parseArgs(['--grid', 'g', '--nope'])).toThrow(/unknown argument/);
    });
});

describe('runTrainScreen', () => {
    it('writes yield.json, verdicts.json and table.md and compares each arm with the reference', async () => {
        // the reference passes the first stage on every offset; the other arm passes both
        const train = fakeTrain((_offset, arm) => ({ passed: arm === 'better' ? 2 : 1 }));
        const { report, out } = await runTrainScreen(args('full', 16), { exec: train.exec });
        expect(train.calls).toHaveLength(32);
        expect(JSON.parse(readFileSync(join(out, 'verdicts.json'), 'utf8'))).toMatchObject({
            reference: 'plain',
            arms: { better: { verdict: 'better', failed: 0 } },
        });
        const yielded = JSON.parse(readFileSync(join(out, 'yield.json'), 'utf8'));
        expect(yielded.plain).toMatchObject({ runs: 16 });
        expect(yielded.better.stages[1]).toMatchObject({ stage: 'two', passShare: 1 });
        const table = readFileSync(join(out, 'table.md'), 'utf8');
        expect(table).toContain('# Ladder screen (reference: plain)');
        expect(table).toContain('verdict: better');
        expect(report.table).toBe(table);
        const log = readFileSync(join(root, 'logs', 'train-screen-full.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(log.filter((r) => r.event === 'TrainScreenVerdict')).toEqual([
            expect.objectContaining({ arm: 'better', reference: 'plain', verdict: 'better', matched: 16 }),
        ]);
    });

    it('refuses a verdict under 16 matched offsets, and leaves a failed run out of the yield', async () => {
        const train = fakeTrain((offset) => ({ passed: 1, exitCode: offset === 8 ? 1 : 0 }));
        const { report } = await runTrainScreen(args('few', 4), { exec: train.exec });
        expect(report.verdicts.arms.better).toMatchObject({ verdict: 'refused', failed: 1 });
        expect(report.verdicts.arms.better.reason).toMatch(/at least 16 matched offsets, got 3/);
        expect(report.yield.plain.runs).toBe(3);
        expect(report.table).toContain('verdict: refused');
        expect(report.table).toContain('1 run(s) failed and are left out');
    });

    it('reuses the runs of an earlier invocation', async () => {
        const first = fakeTrain(() => ({ passed: 1 }));
        await runTrainScreen(args('again', 2), { exec: first.exec });
        const second = fakeTrain(() => ({ passed: 1 }));
        await runTrainScreen(args('again', 2), { exec: second.exec });
        expect(first.calls).toHaveLength(4);
        expect(second.calls).toEqual([]);
    });
});

describe('main', () => {
    it('exits 1 with nothing printed on a grid file that does not exist', async () => {
        /** @type {string[]} */
        const lines = [];
        expect(await main(['--grid', join(root, 'nothing.grid.json')], (l) => lines.push(l))).toBe(1);
        expect(lines).toEqual([]);
    });
});
