import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, parseArgs, runStudy } from '../scripts/reflex-correlate.mjs';

const root = mkdtempSync(join(tmpdir(), 'reflex-correlate-slow-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** @returns {string[]} the arguments of a small study over twelve random brains and nothing else */
function smallStudy() {
    return [
        '--league',
        join(root, 'none.json'),
        '--train-dir',
        join(root, 'none'),
        '--archives',
        join(root, 'none'),
        '--random',
        '12',
        '--seeds',
        '2',
        '--drill-trials',
        '2',
        '--resamples',
        '100',
        '--workers',
        '2',
    ];
}

describe('runStudy', () => {
    it('scores random brains on the cases and the drills, and prints a line per pair, per outcome and the verdict', async () => {
        /** @type {string[]} */
        const lines = [];
        const result = await runStudy(parseArgs(smallStudy()), { print: (l) => lines.push(l) });
        expect(result.pairs).toHaveLength(4);
        expect(result.pairs.every((p) => p.n === 6)).toBe(true);
        expect(result.outcomes.map((o) => o.n)).toEqual([0, 0]);
        expect(['both', 'filter only', 'drop']).toContain(result.verdict);
        expect(result.verdict).toBe('drop');
        expect(lines.join('\n')).toContain('verdict: drop');
    });

    it('writes the same text to --out as it prints, and JSON rows with --json', async () => {
        const out = join(root, 'study.json');
        /** @type {string[]} */
        const lines = [];
        const code = await main([...smallStudy(), '--json', '--out', out], (l) => lines.push(l));
        expect(code).toBe(0);
        const written = JSON.parse(readFileSync(out, 'utf8'));
        expect(written.rows).toHaveLength(12);
        expect(written.rows[0].reflex).toBeTypeOf('object');
        expect(written.verdict).toBe('drop');
        expect(JSON.parse(lines[lines.length - 1]).verdict).toBe('drop');
    });
});
