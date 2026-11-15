import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { emitReport, sharedFlags, withLogFile } from '../scripts/lib/audit-io.mjs';

const root = mkdtempSync(join(tmpdir(), 'audit-io-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('sharedFlags', () => {
    it('reads --config, --workers and --out', () => {
        const flags = sharedFlags('usage');
        expect(flags['--config']('a.json', '--config')).toEqual(['config', 'a.json']);
        expect(flags['--workers']('3', '--workers')).toEqual(['workers', 3]);
        expect(flags['--out']('x.txt', '--out')).toEqual(['out', 'x.txt']);
        expect(() => flags['--workers']('0', '--workers')).toThrow(/>= 1/);
    });
});

describe('emitReport', () => {
    it('prints, and writes the file only when asked', () => {
        /** @type {string[]} */
        const printed = [];
        const out = join(root, 'report.txt');
        emitReport('hello', { print: (t) => printed.push(t), out: null });
        expect(existsSync(out)).toBe(false);
        emitReport('hello', { print: (t) => printed.push(t), out });
        expect(printed).toEqual(['hello', 'hello']);
        expect(readFileSync(out, 'utf8')).toBe('hello\n');
    });
});

describe('withLogFile', () => {
    it('starts a fresh file, logs at its level and returns what the body returns', async () => {
        const path = join(root, 'run.jsonl');
        writeFileSync(path, 'stale\n');
        const result = await withLogFile({ path, level: 'info' }, async (log) => {
            log.log('info', 'Kept', { n: 1 });
            log.log('debug', 'Dropped', {});
            return 7;
        });
        expect(result).toBe(7);
        const lines = readFileSync(path, 'utf8').trim().split('\n');
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0])).toMatchObject({ event: 'Kept', n: 1 });
    });
});
