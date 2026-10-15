import { describe, expect, it } from 'vitest';
import { compareResults, formatRow, parseArgs } from '../scripts/browser-hash.mjs';

const cases = [
    { name: 'a', worldHash: '01' },
    { name: 'b', worldHash: '02' },
];

describe('browser-hash', () => {
    it('parses the defaults and flags', () => {
        expect(parseArgs([])).toEqual({ cdp: '', headed: false });
        expect(parseArgs(['--headed', '--cdp=http://127.0.0.1:9222'])).toEqual({
            cdp: 'http://127.0.0.1:9222',
            headed: true,
        });
    });

    it('rejects an unknown or empty argument', () => {
        expect(() => parseArgs(['--nope'])).toThrow('Unknown argument "--nope"');
        expect(() => parseArgs(['--cdp='])).toThrow('Unknown argument');
    });

    it('passes when every hash matches', () => {
        const { ok, rows } = compareResults(cases, [
            { worldHash: '01', ms: 5 },
            { worldHash: '02', ms: 6 },
        ]);
        expect(ok).toBe(true);
        expect(rows.map((row) => row.name)).toEqual(['a', 'b']);
    });

    it('fails on a mismatching hash and on a worker error', () => {
        const { ok, rows } = compareResults(cases, [
            { worldHash: '99', ms: 5 },
            { error: 'boom', ms: 6 },
        ]);
        expect(ok).toBe(false);
        expect(rows.map((row) => row.ok)).toEqual([false, false]);
        expect(rows[1].actual).toBe('error: boom');
    });

    it('throws when the result count differs from the case count', () => {
        expect(() => compareResults(cases, [])).toThrow('Expected 2 results, got 0');
    });

    it('formats a row with expected, actual and time', () => {
        const line = formatRow({ name: 'a', expected: '01', actual: '02', ms: 12.4, ok: false });
        expect(line).toBe('FAIL a: expected 01, actual 02 (12 ms)');
    });
});
