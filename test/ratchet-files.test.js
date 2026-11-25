import { describe, expect, it } from 'vitest';
import { fileLimits, fileMisses, measuredSources } from '../scripts/lib/ratchet-files.mjs';

const BASELINE = {
    coverage: {
        'js/sim': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'js/app': { lines: 100, branches: 99.1, functions: 100, statements: 100 },
        scripts: { lines: 96, branches: 89 },
    },
};

describe('fileLimits', () => {
    it('holds the metrics a scope keeps at 100, changed or new', () => {
        const full = { lines: 100, branches: 100, functions: 100, statements: 100 };
        expect(fileLimits(BASELINE, 'js/sim/a.js', false)).toEqual(full);
        expect(fileLimits(BASELINE, 'js/app/b.js', false)).toEqual({ lines: 100, functions: 100, statements: 100 });
    });

    it("holds a new file in a lower scope to that scope's baseline, and a changed one to nothing (T50)", () => {
        expect(fileLimits(BASELINE, 'scripts/x.mjs', true)).toEqual({ lines: 96, branches: 89 });
        expect(fileLimits(BASELINE, 'scripts/x.mjs', false)).toEqual({});
        expect(fileLimits(BASELINE, 'js/app/b.js', true)).toEqual({
            lines: 100,
            branches: 99.1,
            functions: 100,
            statements: 100,
        });
    });

    it('holds nothing for an unknown scope or a path outside every scope', () => {
        expect(fileLimits(BASELINE, 'js/evo/c.js', true)).toEqual({});
        expect(fileLimits(BASELINE, 'docs/readme.md', true)).toEqual({});
        expect(fileLimits({}, 'js/sim/a.js', false)).toEqual({});
    });
});

describe('measuredSources', () => {
    it('keeps changed sources under a 100% baseline and new sources in a lower scope; drops tests and docs', () => {
        const changed = ['js/sim/a.js', 'test/sim/a.test.js', 'js/sim/notes.md', 'scripts/x.mjs', 'js/app/b.mjs'];
        expect(measuredSources(changed, new Set(), BASELINE)).toEqual(['js/sim/a.js', 'js/app/b.mjs']);
        expect(measuredSources(changed, new Set(['scripts/x.mjs', 'test/sim/a.test.js']), BASELINE)).toEqual([
            'js/sim/a.js',
            'scripts/x.mjs',
            'js/app/b.mjs',
        ]);
    });
});

describe('fileMisses', () => {
    /**
     * @param {number} covered covered count of every metric
     * @param {number} [total] total count of every metric
     * @returns {Record<string, {total: number, covered: number}>} a summary entry
     */
    const entry = (covered, total = 4) =>
        Object.fromEntries(['lines', 'branches', 'functions', 'statements'].map((m) => [m, { total, covered }]));
    const where = { root: '/repo', files: ['js/sim/a.js', 'js/app/b.js'] };

    it('passes files at 100% and ignores files that were not asked for', () => {
        const summary = {
            total: entry(0),
            '/repo/js/sim/a.js': entry(4),
            '/repo/js/app/b.js': entry(4),
            '/repo/js/sim/other.js': entry(0),
        };
        expect(fileMisses(summary, {}, BASELINE, where)).toEqual([]);
    });

    it('reports each strict metric of a file that misses and only those', () => {
        const summary = { '/repo/js/sim/a.js': entry(4), '/repo/js/app/b.js': entry(3) };
        const misses = fileMisses(summary, {}, BASELINE, where);
        expect(misses).toEqual([
            '  js/app/b.js: lines 3/4',
            '  js/app/b.js: functions 3/4',
            '  js/app/b.js: statements 3/4',
        ]);
    });

    it('names the uncovered lines when coverage-final has the file', () => {
        const summary = {
            '/repo/js/sim/a.js': { ...entry(4), lines: { total: 4, covered: 3 } },
            '/repo/js/app/b.js': entry(4),
        };
        const final = { '/repo/js/sim/a.js': { statementMap: { 0: { start: { line: 7 } } }, s: { 0: 0 } } };
        expect(fileMisses(summary, final, BASELINE, where)).toEqual(['  js/sim/a.js: lines 3/4, uncovered lines 7']);
    });

    it("fails a new script under its scope's baseline and passes one at or above it (T50)", () => {
        const added = new Set(['scripts/x.mjs']);
        const files = ['scripts/x.mjs'];
        const low = { '/repo/scripts/x.mjs': { ...entry(100, 100), lines: { total: 100, covered: 95 } } };
        expect(fileMisses(low, {}, BASELINE, { root: '/repo', files, added })).toEqual([
            "  scripts/x.mjs: lines 95/100 (a new file needs the scope's 96%)",
        ]);
        const high = { '/repo/scripts/x.mjs': { ...entry(100, 100), branches: { total: 100, covered: 89 } } };
        expect(fileMisses(high, {}, BASELINE, { root: '/repo', files, added })).toEqual([]);
    });

    it('fails a measured file that no related test loaded, and passes a metric with nothing to count', () => {
        const added = new Set(['scripts/x.mjs']);
        expect(fileMisses({}, {}, BASELINE, { root: '/repo', files: ['scripts/x.mjs'], added })).toEqual([
            '  scripts/x.mjs: loaded by no related test',
        ]);
        const empty = { '/repo/scripts/x.mjs': entry(0, 0) };
        expect(fileMisses(empty, {}, BASELINE, { root: '/repo', files: ['scripts/x.mjs'], added })).toEqual([]);
    });
});
