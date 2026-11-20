import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compressLines, describeMiss, detailForScopes, uncovered } from '../scripts/lib/coverage-detail.mjs';
import { failedLimits, main } from '../scripts/quality-ratchet.mjs';

/** An istanbul entry with three uncovered statements, one uncovered branch arm and one uncovered function. */
const ENTRY = {
    statementMap: {
        0: { start: { line: 3 } },
        1: { start: { line: 4 } },
        2: { start: { line: 9 } },
        3: { start: { line: 1 } },
    },
    s: { 0: 0, 1: 0, 2: 0, 3: 2 },
    branchMap: { 0: { line: 5, locations: [{ start: { line: 5 } }, { start: {} }] } },
    b: { 0: [4, 0] },
    fnMap: { 0: { name: 'unused', line: 12 }, 1: { name: 'used', line: 2 } },
    f: { 0: 0, 1: 3 },
};

describe('compressLines', () => {
    it('joins runs into ranges and drops duplicates', () => {
        expect(compressLines([9, 3, 4, 5, 5, 12, 13])).toBe('3-5, 9, 12-13');
        expect(compressLines([])).toBe('');
    });
});

describe('uncovered', () => {
    it('collects the statement lines, branch arms and functions with a zero count', () => {
        expect(uncovered(ENTRY)).toEqual({ lines: [3, 4, 9], branches: [5], functions: ['unused (line 12)'] });
    });

    it('reads an entry with no detail as nothing missed', () => {
        expect(uncovered(undefined)).toEqual({ lines: [], branches: [], functions: [] });
    });
});

describe('describeMiss', () => {
    const counts = { covered: 1, total: 4 };
    it('names the uncovered lines, branches or functions for the metric', () => {
        expect(describeMiss('js/sim/a.js', 'lines', counts, ENTRY)).toBe(
            '  js/sim/a.js: lines 1/4, uncovered lines 3-4, 9',
        );
        expect(describeMiss('js/sim/a.js', 'branches', counts, ENTRY)).toContain('uncovered branches at lines 5');
        expect(describeMiss('js/sim/a.js', 'functions', counts, ENTRY)).toContain('unused (line 12)');
    });

    it('prints the counts alone when the run wrote no detail', () => {
        expect(describeMiss('js/sim/a.js', 'lines', counts, undefined)).toBe('  js/sim/a.js: lines 1/4');
    });
});

describe('detailForScopes', () => {
    /**
     * @param {number} covered covered count
     * @returns {Record<string, {covered: number, total: number}>} counts
     */
    const counts = (covered) => ({ lines: { covered, total: 10 } });
    const summary = {
        '/repo/js/sim/a.js': counts(9),
        '/repo/js/sim/b.js': counts(10),
        '/repo/js/sim/c.js': counts(2),
        '/repo/js/evo/d.js': counts(0),
    };

    it('lists the files of the failing scope, the largest miss first, and none that are covered', () => {
        const out = detailForScopes(summary, {}, '/repo', [{ scope: 'js/sim', metric: 'lines' }]);
        expect(out[0]).toBe('js/sim lines: 2 file(s) not fully covered');
        expect(out[1]).toContain('js/sim/c.js');
        expect(out[2]).toContain('js/sim/a.js');
        expect(out).toHaveLength(3);
    });

    it('cuts a long list and counts the rest', () => {
        const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`/repo/js/sim/f${i}.js`, counts(1)]));
        const out = detailForScopes(many, {}, '/repo', [{ scope: 'js/sim', metric: 'lines' }]);
        expect(out).toHaveLength(17);
        expect(out.at(-1)).toBe('  [... 5 more files]');
    });
});

describe('failedLimits', () => {
    it('returns the scope and metric of each miss beside its message', () => {
        const [miss] = failedLimits({ 'js/sim': { lines: 80 } }, { coverage: { 'js/sim': { lines: 90 } } });
        expect(miss).toMatchObject({ scope: 'js/sim', metric: 'lines' });
        expect(miss.message).toContain('measured 80.00%');
    });
});

describe('main --check detail', () => {
    /**
     * @param {boolean} withFinal whether coverage-final.json is written
     * @returns {string[]} the lines main printed to stderr on a miss
     */
    function run(withFinal) {
        const root = mkdtempSync(join(tmpdir(), 'ratchet-detail-'));
        mkdirSync(join(root, 'scripts'));
        mkdirSync(join(root, 'coverage'));
        writeFileSync(
            join(root, 'scripts/quality-baseline.json'),
            JSON.stringify({ coverage: { 'js/sim': { lines: 100 } } }),
        );
        const file = join(root, 'js/sim/a.js');
        writeFileSync(
            join(root, 'coverage/coverage-summary.json'),
            JSON.stringify({
                total: {},
                [file]: Object.fromEntries(
                    ['lines', 'branches', 'functions', 'statements'].map((m) => [m, { total: 3, covered: 1 }]),
                ),
            }),
        );
        if (withFinal) {
            writeFileSync(join(root, 'coverage/coverage-final.json'), JSON.stringify({ [file]: ENTRY }));
        }
        /** @type {string[]} */
        const errors = [];
        const original = console.error;
        console.error = (message) => errors.push(message);
        try {
            expect(main(['--check'], root)).toBe(1);
        } finally {
            console.error = original;
        }
        return errors;
    }

    it('names the file and its uncovered lines under the failing scope', () => {
        const errors = run(true);
        expect(errors[0]).toContain('js/sim lines coverage is below its baseline');
        expect(errors).toContain('  js/sim/a.js: lines 1/3, uncovered lines 3-4, 9');
    });

    it('still names the file when coverage-final.json is absent', () => {
        expect(run(false)).toContain('  js/sim/a.js: lines 1/3');
    });
});
