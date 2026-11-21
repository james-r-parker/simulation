import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    collectRuns,
    inFlight,
    parseWorkers,
    seedsDone,
    seedsDoneOf,
    underUseWarning,
    workerLedger,
} from '../scripts/lib/run-workers.mjs';

let dir = '';
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-workers-'));
    // The budget rule under test is the workstation's (defaultWorkers keeps 8 cores back); CI takes every core.
    vi.stubEnv('CI', '');
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

describe('parseWorkers', () => {
    it('reads --workers in both spellings', () => {
        expect(parseWorkers('npm run eval -- --workers 12', 32)).toBe(12);
        expect(parseWorkers('node scripts/eval.mjs --workers=5 --seeds 4', 32)).toBe(5);
    });

    it('falls back to the pool default for a pool command and null for any other', () => {
        expect(parseWorkers('npm run eval -- --seeds 16', 32)).toBe(24);
        expect(parseWorkers('node scripts/screen.mjs --grid g.json', 16)).toBe(8);
        expect(parseWorkers('npm test', 32)).toBeNull();
        expect(parseWorkers('bash -c exit', 32)).toBeNull();
    });

    it('takes every core as the pool default on CI', () => {
        vi.stubEnv('CI', 'true');
        expect(parseWorkers('npm run eval -- --seeds 16', 32)).toBe(32);
    });
});

describe('workerLedger and underUseWarning', () => {
    it('subtracts the claims of runs in flight from the budget', () => {
        expect(workerLedger([{ workers: 10 }, { workers: null }, {}], 32)).toEqual({
            budget: 24,
            claimed: 10,
            free: 14,
        });
        expect(workerLedger([{ workers: 40 }], 32).free).toBe(0);
    });

    it('warns once when a lone run asks for under half the free workers', () => {
        expect(underUseWarning(4, [], 32)).toBe(
            'warning: this run uses 4 of 24 free workers and nothing else is running; add --workers 24',
        );
        expect(underUseWarning(12, [], 32)).toBeNull();
        expect(underUseWarning(null, [], 32)).toBeNull();
        expect(underUseWarning(1, [{ workers: 8 }], 32)).toBeNull();
    });
});

describe('runs in flight', () => {
    it('is in flight with a live pid and no .done file, and not after .done or with a dead pid', () => {
        const run = { name: 'a', pid: process.pid, dir };
        expect(inFlight(run)).toBe(true);
        writeFileSync(join(dir, 'a.done'), '0');
        expect(inFlight(run)).toBe(false);
        expect(inFlight({ name: 'b', pid: 2 ** 22 + 12345, dir })).toBe(false);
    });

    it('collects runs from each registry once and skips a missing or damaged one', () => {
        mkdirSync(join(dir, 'x'));
        const good = join(dir, 'x', 'runs.json');
        const bad = join(dir, 'bad.json');
        writeFileSync(good, JSON.stringify([{ name: 'r1' }, { name: 'r2' }]));
        writeFileSync(bad, '{not json');
        expect(collectRuns([good, good, bad, join(dir, 'none.json')]).map((r) => r.name)).toEqual(['r1', 'r2']);
    });
});

describe('seeds done', () => {
    it('counts the seed done lines of a log', () => {
        expect(seedsDone('x\nseed 1 done in 3.0s worldHash a\nseed 2 done in 1s\nseed 3 running')).toBe(2);
        writeFileSync(join(dir, 'e.log'), 'seed 1 done in 1s worldHash a\n');
        expect(seedsDoneOf({ name: 'e', dir })).toBe(1);
        expect(seedsDoneOf({ name: 'missing', dir })).toBeNull();
        writeFileSync(join(dir, 'none.log'), 'hello\n');
        expect(seedsDoneOf({ name: 'none', dir })).toBeNull();
    });
});
