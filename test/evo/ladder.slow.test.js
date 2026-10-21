import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main, parseArgs, runLadder } from '../../scripts/ladder.mjs';

const SMALL = { initialAgents: 10, maxAgents: 20, maxFood: 100, initialFood: 100 };
/** @type {string} */
let dir;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ladder-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('parseArgs', () => {
    it('defaults to 10000 ticks on 3 seeds and reads each flag', () => {
        expect(parseArgs([])).toMatchObject({ ticks: 10000, seeds: 3, config: null, out: null, workers: null });
        expect(parseArgs(['--ticks', '50', '--seeds', '2', '--workers', '1', '--out', 'x.json'])).toMatchObject({
            ticks: 50,
            seeds: 2,
            workers: 1,
            out: 'x.json',
        });
    });

    it('rejects an unknown flag', () => {
        expect(() => parseArgs(['--rungs'])).toThrow(/unknown argument: --rungs/);
    });
});

describe('runLadder', () => {
    it('runs one rung on one seed for 500 ticks, writes the report and logs the events', async () => {
        const out = join(dir, 'ladder.json');
        const logDir = join(dir, 'logs');
        const { report } = await runLadder({
            ticks: 500,
            seeds: 1,
            rungs: ['foodSeeker'],
            configOverrides: SMALL,
            out,
            logDir,
            workers: 1,
            sha: 'test',
        });
        expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(report);
        expect(report.rungs).toHaveLength(1);
        expect(report.rungs[0]).toMatchObject({ rung: 'foodSeeker', ladder: 'forage', ratioToPrevious: null });
        const events = readFileSync(join(logDir, 'ladder-test-1x500.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line).event);
        expect(events.slice(0, 2)).toEqual(['LadderStarted', 'LadderRungDone']);
    }, 60_000);

    it('logs LadderFailed when the run cannot start', async () => {
        const logDir = join(dir, 'fail-logs');
        await expect(
            runLadder({
                ticks: 5,
                seeds: 1,
                rungs: ['foodSeeker'],
                configOverrides: { maxAgents: -1 },
                out: join(dir, 'f.json'),
                logDir,
                workers: 1,
                sha: 'fail',
            }),
        ).rejects.toThrow();
        const lines = readFileSync(join(logDir, 'ladder-fail-1x5.jsonl'), 'utf8').trim().split('\n');
        expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({ level: 'error', event: 'LadderFailed' });
    }, 60_000);
});

describe('main', () => {
    it('reads --config, runs every rung and returns 0', async () => {
        const config = join(dir, 'small.json');
        writeFileSync(config, JSON.stringify(SMALL));
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const args = [
                '--ticks',
                '5',
                '--seeds',
                '1',
                '--workers',
                '1',
                '--config',
                config,
                '--out',
                join(dir, 'm.json'),
            ];
            expect(await main(args, { logDir: join(dir, 'main-logs') })).toBe(0);
            expect(JSON.parse(readFileSync(join(dir, 'm.json'), 'utf8')).rungs.length).toBeGreaterThan(0);
            expect(log).toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    }, 120_000);

    it('returns 1 and prints the error for an unknown flag', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(await main(['--bogus'])).toBe(1);
            expect(error).toHaveBeenCalled();
        } finally {
            error.mockRestore();
        }
    });
});
