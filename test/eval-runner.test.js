import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateReport } from '../js/evo/report.js';
import { main, parseArgs, pickSeeds, runEval, startCpuReport } from '../scripts/eval.mjs';
import { cpuUse } from '../scripts/lib/cpu-use.mjs';

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
        const report = JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8'));
        expect(lines[0].configHash).toBe(report.configHash);
    }, 60_000);

    it('names the run after a non-zero seed offset so it does not overwrite the offset-0 run', async () => {
        await runEval({
            seeds: 1,
            ticks: 100,
            seedOffset: 8,
            policy: 'baseline-v5',
            configOverrides: SMALL,
            out: join(dir, 'd.json'),
            logDir: join(dir, 'logs'),
            workers: 1,
            sha: 'test',
        });
        expect(readFileSync(join(dir, 'logs', 'eval-baseline-v5-test-1x100-o8.jsonl'), 'utf8')).toContain(
            'EvalStarted',
        );
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

describe('startCpuReport', () => {
    it('prints on each interval and once more for the whole run on stop', () => {
        vi.useFakeTimers();
        try {
            /** @type {string[]} */
            const lines = [];
            const report = startCpuReport((line) => lines.push(line));
            vi.advanceTimersByTime(20_000);
            report.stop();
            expect(lines).toHaveLength(3);
            expect(lines[0]).toMatch(/^cpu \d+% of \d+ threads$/);
            expect(lines[2]).toMatch(/^cpu \d+% of \d+ threads \(whole run\)$/);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('main', () => {
    /**
     * @param {string[]} argv arguments
     * @param {string} name output stem
     * @returns {Promise<{ code: number, out: string[], err: string[] }>} the exit code and the console output
     */
    async function runMain(argv, name) {
        /** @type {string[]} */
        const out = [];
        /** @type {string[]} */
        const err = [];
        const logSpy = vi.spyOn(console, 'log').mockImplementation((line) => void out.push(String(line)));
        const errSpy = vi.spyOn(console, 'error').mockImplementation((line) => void err.push(String(line)));
        try {
            const code = await main(argv, { logDir: join(dir, `logs-${name}`) });
            return { code, out, err };
        } finally {
            logSpy.mockRestore();
            errSpy.mockRestore();
        }
    }

    it('exits 0 and writes the report for a tiny run', async () => {
        const config = join(dir, 'small.json');
        writeFileSync(config, JSON.stringify(SMALL));
        const target = join(dir, 'main.json');
        const { code, out } = await runMain(
            ['--seeds', '1', '--ticks', '50', '--policy', 'baseline-v5', '--config', config, '--out', target],
            'ok',
        );
        expect(code).toBe(0);
        expect(out.some((line) => line.startsWith(`wrote ${target}`))).toBe(true);
        expect(() => validateReport(JSON.parse(readFileSync(target, 'utf8')))).not.toThrow();
    }, 60_000);

    it('exits 1, logs SeedFailed and prints a reproduce line when a seed fails', async () => {
        const config = join(dir, 'bad.json');
        writeFileSync(config, JSON.stringify({ ...SMALL, eventCapacity: 5 }));
        const { code, err } = await runMain(
            [
                '--seeds',
                '1',
                '--ticks',
                '50',
                '--policy',
                'baseline-v5',
                '--config',
                config,
                '--out',
                join(dir, 'x.json'),
            ],
            'bad',
        );
        const seed = pickSeeds(1, 0)[0];
        expect(code).toBe(1);
        expect(err[0]).toContain(`seed ${seed} failed at tick 0`);
        expect(err[1]).toBe(
            `reproduce: npm run replay -- --policy baseline-v5 --config ${config} --seed ${seed} --ticks 1`,
        );
        const logs = readFileSync(
            join(dir, 'logs-bad', 'eval-baseline-v5-' + shaOf(join(dir, 'logs-bad')) + '.jsonl'),
            'utf8',
        );
        expect(logs).toContain('"event":"SeedFailed"');
    }, 60_000);

    it.each([[['--seeds', '0']], [['--seeds', '2', '--seed-offset', '31']], [['--policy', 'nope']]])(
        'rejects bad arguments %j',
        async (argv) => {
            await expect(main(argv)).rejects.toThrow(/seeds|policy|Unknown/i);
        },
    );
});

/**
 * @param {string} logDir a log directory holding one eval log
 * @returns {string} the log's name between `eval-baseline-v5-` and `.jsonl`
 */
function shaOf(logDir) {
    const name = readdirSync(logDir)[0];
    return name.slice('eval-baseline-v5-'.length, -'.jsonl'.length);
}
