import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateReport } from '../js/evo/report.js';
import { cpuUse, parseArgs, pickSeeds, runEval } from '../scripts/eval.mjs';

const SMALL = { maxAgents: 60, initialAgents: 30, minAgents: 10, worldWidth: 2000, worldHeight: 1000 };
/** @type {string} */
let dir;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-runner-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * @param {string} name output file stem
 * @param {number} workers pool size
 * @returns {ReturnType<typeof runEval>} the run
 */
function run(name, workers) {
    return runEval({
        seeds: 2,
        ticks: 2000,
        policy: 'baseline-v5',
        configOverrides: SMALL,
        out: join(dir, `${name}.json`),
        logDir: join(dir, 'logs'),
        workers,
        sha: 'test',
    });
}

describe('runEval', () => {
    it('writes identical valid reports for 2 workers and 1 worker', async () => {
        const [a, b] = [await run('a', 2), await run('b', 1)];
        expect(a.report).toEqual(b.report);
        expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe(readFileSync(join(dir, 'b.json'), 'utf8'));
        expect(() => validateReport(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8')))).not.toThrow();
        expect(a.report.seeds).toEqual(pickSeeds(2, 0));
        expect(a.results.map((r) => r.worldHash)).toEqual(b.results.map((r) => r.worldHash));
        expect(a.report.fitnessName).toBe('v5');
    }, 60_000);

    it('logs the start, each seed and the finish', async () => {
        await run('c', 2);
        const lines = readFileSync(join(dir, 'logs', 'eval-baseline-v5-test-2x2000.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        expect(lines.map((l) => l.event)).toEqual(['EvalStarted', 'SeedFinished', 'SeedFinished', 'EvalFinished']);
    }, 60_000);
});

describe('parseArgs', () => {
    it('defaults to 8 seeds, 200000 ticks and the live policy', () => {
        expect(parseArgs([])).toMatchObject({ seeds: 8, ticks: 200000, policy: 'baseline-v5', seedOffset: 0 });
    });

    it('maps live to the live policy and reads every flag', () => {
        const args = parseArgs([
            '--seeds',
            '2',
            '--ticks',
            '50',
            '--policy',
            'live',
            '--seed-offset',
            '3',
            '--workers',
            '4',
            '--out',
            'x.json',
            '--config',
            'c.json',
        ]);
        expect(args).toMatchObject({
            seeds: 2,
            ticks: 50,
            policy: 'baseline-v5',
            seedOffset: 3,
            workers: 4,
            out: 'x.json',
            config: 'c.json',
        });
    });

    it.each([
        ['--seeds', '0'],
        ['--ticks', 'x'],
        ['--workers', '0'],
        ['--policy', 'nope'],
        ['--bogus', '1'],
    ])('rejects %s %s with usage', (...argv) => {
        expect(() => parseArgs(argv)).toThrow(/usage: eval/);
    });
});

describe('pickSeeds', () => {
    it('takes a window of the fixed seeds and refuses to run past 32', () => {
        expect(pickSeeds(2, 1)).toEqual(pickSeeds(3, 0).slice(1));
        expect(pickSeeds(32, 0)).toHaveLength(32);
        expect(() => pickSeeds(2, 31)).toThrow('<= 32');
    });
});

describe('cpuUse', () => {
    const t = (/** @type {number} */ busy, /** @type {number} */ idle) => ({
        times: { user: busy, nice: 0, sys: 0, idle, irq: 0 },
    });

    it('is the busy share of the elapsed CPU time over every thread', () => {
        expect(cpuUse([t(0, 0), t(0, 0)], [t(75, 25), t(25, 75)])).toEqual({ pct: 50, threads: 2 });
    });

    it('is 0 when no time passed', () => {
        expect(cpuUse([t(5, 5)], [t(5, 5)])).toEqual({ pct: 0, threads: 1 });
    });
});
