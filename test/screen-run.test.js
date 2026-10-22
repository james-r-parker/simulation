import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadReusable, reportMatches, reportPath } from '../scripts/lib/screen-run.mjs';
import { parseArgs } from '../scripts/screen.mjs';

/** @type {string} */
let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'screen-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('reusable reports', () => {
    const expected = { configHash: 'h', ticks: 10, seeds: [1, 2], policy: 'p' };

    it('matches only the same hash, ticks, policy, seeds and a trace', () => {
        const report = { configHash: 'h', ticks: 10, seeds: [1, 2], policy: 'p', traces: [] };
        expect(reportMatches(report, expected)).toBe(true);
        for (const change of [
            { configHash: 'x' },
            { ticks: 11 },
            { seeds: [1, 3] },
            { policy: 'q' },
            { traces: undefined },
        ]) {
            expect(reportMatches({ ...report, ...change }, expected)).toBe(false);
        }
    });

    it('treats a missing, corrupt or invalid file as not reusable', () => {
        const path = reportPath(dir, 'x');
        expect(loadReusable(path, expected)).toBeNull();
        writeFileSync(path, '{not json');
        expect(loadReusable(path, expected)).toBeNull();
        writeFileSync(path, '{}');
        expect(loadReusable(path, expected)).toBeNull();
    });
});

describe('parseArgs', () => {
    it('requires --grid and rejects unknown flags', () => {
        expect(() => parseArgs([])).toThrow(/--grid is required/);
        expect(() => parseArgs(['--grid', 'g', '--bogus'])).toThrow(/unknown argument/);
        expect(parseArgs(['--grid', 'g', '--no-lock', '--force'])).toMatchObject({ noLock: true, force: true });
    });

    it('takes the worker budget and the grid overrides', () => {
        expect(
            parseArgs(['--grid', 'g', '--workers', '30', '--seeds', '2', '--ticks', '20000', '--seed-offset', '28']),
        ).toMatchObject({ workers: 30, seeds: 2, ticks: 20000, seedOffset: 28, traceInterval: null });
        expect(parseArgs(['--grid', 'g', '--trace-interval', '500', '--out', 'o']).traceInterval).toBe(500);
    });
});
