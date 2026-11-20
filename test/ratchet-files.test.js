import { describe, expect, it } from 'vitest';
import { fileMisses, strictMetrics, strictSources } from '../scripts/lib/ratchet-files.mjs';

const BASELINE = {
    coverage: {
        'js/sim': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'js/app': { lines: 100, branches: 99.1, functions: 100, statements: 100 },
        scripts: { lines: 96, branches: 89 },
    },
};

describe('strictMetrics', () => {
    it('lists the metrics a scope holds at 100', () => {
        expect(strictMetrics(BASELINE, 'js/sim/a.js')).toEqual(['lines', 'branches', 'functions', 'statements']);
        expect(strictMetrics(BASELINE, 'js/app/b.js')).toEqual(['lines', 'functions', 'statements']);
    });

    it('lists none for a lower baseline, an unknown scope or a path outside every scope', () => {
        expect(strictMetrics(BASELINE, 'scripts/x.mjs')).toEqual([]);
        expect(strictMetrics(BASELINE, 'js/evo/c.js')).toEqual([]);
        expect(strictMetrics(BASELINE, 'docs/readme.md')).toEqual([]);
        expect(strictMetrics({}, 'js/sim/a.js')).toEqual([]);
    });
});

describe('strictSources', () => {
    it('keeps changed source files under a 100% baseline and drops tests, docs and lower scopes', () => {
        const changed = ['js/sim/a.js', 'test/sim/a.test.js', 'js/sim/notes.md', 'scripts/x.mjs', 'js/app/b.mjs'];
        expect(strictSources(changed, BASELINE)).toEqual(['js/sim/a.js', 'js/app/b.mjs']);
    });
});

describe('fileMisses', () => {
    /**
     * @param {number} covered covered count of every metric
     * @returns {Record<string, {total: number, covered: number}>} a summary entry of 4 each
     */
    const entry = (covered) =>
        Object.fromEntries(['lines', 'branches', 'functions', 'statements'].map((m) => [m, { total: 4, covered }]));
    const where = { root: '/repo', files: ['js/sim/a.js', 'js/app/b.js'] };

    it('passes files at 100% and ignores files that were not asked for', () => {
        const summary = { total: entry(0), '/repo/js/sim/a.js': entry(4), '/repo/js/sim/other.js': entry(0) };
        expect(fileMisses(summary, {}, BASELINE, where)).toEqual([]);
    });

    it('reports each strict metric of a file that misses and only those', () => {
        const summary = { '/repo/js/app/b.js': entry(3) };
        const misses = fileMisses(summary, {}, BASELINE, where);
        expect(misses).toEqual([
            '  js/app/b.js: lines 3/4',
            '  js/app/b.js: functions 3/4',
            '  js/app/b.js: statements 3/4',
        ]);
    });

    it('names the uncovered lines when coverage-final has the file', () => {
        const summary = { '/repo/js/sim/a.js': { ...entry(4), lines: { total: 4, covered: 3 } } };
        const final = { '/repo/js/sim/a.js': { statementMap: { 0: { start: { line: 7 } } }, s: { 0: 0 } } };
        expect(fileMisses(summary, final, BASELINE, where)).toEqual(['  js/sim/a.js: lines 3/4, uncovered lines 7']);
    });
});
