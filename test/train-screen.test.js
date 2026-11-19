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
 * @param {Record<string, any>} [extra] more grid keys
 * @returns {string} the grid file
 */
function gridFile(name, count, extra = {}) {
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
            ...extra,
        }),
    );
    return file;
}

/** @param {string} name the grid's name @param {number} count offsets @param {Record<string, any>} [extra] more grid keys @returns {ReturnType<typeof parseArgs>} args */
const args = (name, count, extra = {}) =>
    parseArgs([
        '--grid',
        gridFile(name, count, extra),
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

    it('reports an arm whose ladder has other stages as incomparable, with every stage in the table', async () => {
        const other = join(root, 'other-ladder.json');
        writeFileSync(
            other,
            JSON.stringify([
                { name: 'one', config: null, generations: 2 },
                { name: 'three', config: null },
            ]),
        );
        const extra = { arms: { plain: {}, shaped: { curriculum: other } } };
        const train = fakeTrain(() => ({ passed: 1 }));
        const { report } = await runTrainScreen(args('other', 16, { ...extra, reference: 'plain' }), {
            exec: train.exec,
        });
        expect(report.verdicts.arms.shaped).toMatchObject({ verdict: 'incomparable', failed: 0 });
        expect(report.verdicts.arms.shaped.reason).toMatch(/different stages/);
        expect(report.table).toMatch(/two\s+\d+% -> -/);
        expect(report.table).toMatch(/three\s+- -> \d+%/);
        expect(report.table).toContain('verdict: incomparable');
        expect(report.yield.plain.passedLast).toBe(0);
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

/** @param {Record<string, string[]>} bad the unlearnable stages by arm ladder (`better` has the 3 episodes) */
const stubCheck = (bad) => {
    /** @type {{ladder: any, options: any}[]} */
    const calls = [];
    const check = async (/** @type {any} */ ladder, /** @type {any} */ options) => {
        calls.push({ ladder, options });
        const arm = bad.better !== undefined && calls.length === 2 ? 'better' : 'plain';
        return ladder.map((/** @type {any} */ e) => ({
            stage: e.name,
            drills: [],
            unchecked: [],
            learnable: bad[arm]?.includes(e.name) ? false : true,
        }));
    };
    return { check, calls };
};

describe('runTrainScreen learnability check', () => {
    it('checks the ladder once per distinct arm ladder, marks the unlearnable arm and still trains it', async () => {
        const train = fakeTrain(() => ({ passed: 1 }));
        const { check, calls } = stubCheck({ better: ['two'] });
        const grid = args('feas', 2, {
            arms: { plain: {}, better: { stages: { one: { generations: 3 } } } },
            feasible: { generations: 5, seeds: 2 },
            until: 'two',
        });
        const { report, out } = await runTrainScreen(grid, { exec: train.exec, check });
        expect(calls).toHaveLength(2);
        expect(calls[0].options).toMatchObject({ generations: 5, seeds: 2, until: 'two' });
        expect(train.calls).toHaveLength(4);
        expect(report.verdicts.unlearnable).toEqual({ plain: [], better: ['two'] });
        expect(report.verdicts.arms.better.unlearnable).toEqual(['two']);
        expect(report.table).toContain('- better: unlearnable: two');
        expect(report.table).toContain('- plain: every checked stage learnable');
        const files = JSON.parse(readFileSync(join(out, 'feasible.json'), 'utf8'));
        expect(files.better[1]).toMatchObject({ stage: 'two', learnable: false });
        expect(JSON.parse(readFileSync(join(out, 'verdicts.json'), 'utf8')).unlearnable.better).toEqual(['two']);
    });

    it('shares one check between arms with the same ladder', async () => {
        const { check, calls } = stubCheck({});
        await runTrainScreen(args('shared', 2), { exec: fakeTrain(() => ({ passed: 1 })).exec, check });
        expect(calls).toHaveLength(1);
    });

    it('leaves an unlearnable arm out when the grid says skipUnlearnable, and never the reference', async () => {
        const train = fakeTrain(() => ({ passed: 1 }));
        const { check } = stubCheck({ better: ['one'] });
        const grid = args('skip', 2, {
            arms: { plain: {}, better: { stages: { one: { generations: 3 } } } },
            skipUnlearnable: true,
        });
        const { report } = await runTrainScreen(grid, { exec: train.exec, check });
        expect(train.calls.map((c) => c.dir.split('/').at(-2))).toEqual(['plain', 'plain']);
        expect(report.verdicts.arms.better).toEqual({ verdict: 'skipped', unlearnable: ['one'], failed: 0 });
        expect(report.table).toContain('- better: unlearnable: one (arm left out)');
    });

    it('does not check when the grid says feasible: false', async () => {
        const { check, calls } = stubCheck({});
        const { report, out } = await runTrainScreen(args('off', 2, { feasible: false }), {
            exec: fakeTrain(() => ({ passed: 1 })).exec,
            check,
        });
        expect(calls).toEqual([]);
        expect(report.verdicts.unlearnable).toBeUndefined();
        expect(() => readFileSync(join(out, 'feasible.json'), 'utf8')).toThrow();
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
