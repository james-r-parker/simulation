import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { failedGates, issueBody, issueTitle } from '../scripts/lib/nightly-digest.mjs';

const SUMMARY = [
    '\u001b[32m✓\u001b[0m lint            1.2s',
    '\u001b[31m✗\u001b[0m bench-compare   400.1s',
    '    base abc head def, median of 5 runs, --sizes=500',
    '    FAIL bench.step_ms@500: base 3.9, head 4.8, change +23.0% (limit +10.0%)',
    '    full log: .checklogs/bench-compare.log',
    '\u001b[33m-\u001b[0m mutation        skipped (no stryker)',
    '\u001b[31m✗\u001b[0m test            90.0s',
    '    FAIL test/sim/x.test.js > x',
    '',
    '1 passed, 2 failed',
].join('\n');

describe('nightly digest', () => {
    it('lists each failed gate with the lines under it, and nothing from passed or skipped gates', () => {
        const failed = failedGates(SUMMARY);
        expect(failed.map((entry) => entry.gate)).toEqual(['bench-compare', 'test']);
        expect(failed[0].lines[0]).toContain('base abc head def');
        expect(failed[1].lines).toEqual(['FAIL test/sim/x.test.js > x']);
    });

    it('names the gates in the title and the run in the body', () => {
        const failed = failedGates(SUMMARY);
        expect(issueTitle(failed)).toBe('Nightly failed: bench-compare, test');
        const body = issueBody(failed, 'https://github.com/o/r/actions/runs/1');
        expect(body).toContain('https://github.com/o/r/actions/runs/1');
        expect(body).toContain('### bench-compare');
    });

    it('still makes an issue when no gate line exists', () => {
        const failed = failedGates('npm error install failed');
        expect(failed).toEqual([]);
        expect(issueTitle(failed)).toContain('no gate output');
        expect(issueBody(failed, 'u')).toContain('No failed gate line');
    });

    it('prints the title with --title and copes with a missing summary file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'nightly-digest-'));
        try {
            const file = join(dir, 's.txt');
            writeFileSync(file, SUMMARY);
            const run = (/** @type {string[]} */ args) =>
                spawnSync('node', ['scripts/lib/nightly-digest.mjs', ...args], { encoding: 'utf8' }).stdout.trim();
            expect(run([file, 'u', '--title'])).toBe('Nightly failed: bench-compare, test');
            expect(run([join(dir, 'missing.txt'), 'u', '--title'])).toContain('no gate output');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
