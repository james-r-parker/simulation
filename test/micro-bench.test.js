import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RESULT_DIR as FIXTURE_RESULT_DIR } from '../bench/micro/fixture.js';
import {
    RESULT_DIR,
    clearResults,
    compareRows,
    formatCompare,
    formatResults,
    medianResults,
    readResults,
} from '../scripts/lib/micro-bench.mjs';

/** @type {string[]} */
const trees = [];

/**
 * @param {Record<string, Record<string, [number, number]>>} suites suite -> benchmark name -> [ops, rme]
 * @returns {string} a tree holding those result files
 */
function treeWith(suites) {
    const tree = mkdtempSync(join(tmpdir(), 'micro-bench-test-'));
    trees.push(tree);
    for (const [suite, benches] of Object.entries(suites)) {
        mkdirSync(join(tree, RESULT_DIR, suite), { recursive: true });
        for (const [name, [ops, rme]] of Object.entries(benches)) {
            const file = join(tree, RESULT_DIR, suite, `${encodeURIComponent(name)}.json`);
            writeFileSync(file, JSON.stringify({ throughput: { mean: ops, rme } }));
        }
    }
    return tree;
}

afterEach(() => {
    for (const tree of trees.splice(0)) {
        rmSync(tree, { recursive: true, force: true });
    }
});

describe('result directory', () => {
    it('is the directory the bench files write to', () => {
        expect(RESULT_DIR).toBe(FIXTURE_RESULT_DIR);
    });
});

describe('readResults', () => {
    it('keys each result by suite and decoded benchmark name', () => {
        const tree = treeWith({
            brain: { 'forwardAll, 500 agents': [120, 0.5] },
            'det-math': { 'detTanh x 1': [9, 2] },
        });
        expect([...readResults(tree)]).toEqual([
            ['brain: forwardAll, 500 agents', { ops: 120, rme: 0.5 }],
            ['det-math: detTanh x 1', { ops: 9, rme: 2 }],
        ]);
    });

    it('throws when the run wrote nothing, and clearResults removes what it wrote', () => {
        const tree = treeWith({ brain: { a: [1, 1] } });
        clearResults(tree);
        expect(() => readResults(tree)).toThrow(/no benchmark results/);
    });
});

describe('medianResults', () => {
    it('takes the median ops and margin per benchmark over the runs', () => {
        const run = (/** @type {number} */ ops, /** @type {number} */ rme) => new Map([['s: a', { ops, rme }]]);
        expect(medianResults([run(100, 1), run(300, 3), run(110, 2)]).get('s: a')).toMatchObject({ ops: 110, rme: 2 });
    });

    it('records half the range of ops over their median as the spread', () => {
        const run = (/** @type {number} */ ops) => new Map([['s: a', { ops, rme: 1 }]]);
        expect(medianResults([run(90), run(100), run(110)]).get('s: a')?.spread).toBeCloseTo(10, 10);
        expect(medianResults([run(100)]).get('s: a')?.spread).toBe(0);
        expect(medianResults([run(0), run(0)]).get('s: a')?.spread).toBe(0);
    });
});

describe('compareRows', () => {
    const base = new Map([
        ['s: same', { ops: 1000, rme: 1 }],
        ['s: fast', { ops: 1000, rme: 1 }],
        ['s: slow', { ops: 1000, rme: 1 }],
    ]);
    const head = new Map([
        ['s: same', { ops: 1010, rme: 1 }],
        ['s: fast', { ops: 1100, rme: 1 }],
        ['s: slow', { ops: 900, rme: 1 }],
        ['s: fresh', { ops: 5, rme: 1 }],
    ]);
    const rows = compareRows(base, head);
    const verdicts = Object.fromEntries(rows.map((row) => [row.name, row.verdict]));

    it('calls a change inside the combined margin the same', () => {
        expect(verdicts['s: same']).toBe('same');
    });

    it('calls a change outside the margin faster or slower', () => {
        expect(verdicts['s: fast']).toBe('faster');
        expect(verdicts['s: slow']).toBe('slower');
    });

    it('lists a benchmark the base lacks as new, with no change', () => {
        expect(rows.find((row) => row.name === 's: fresh')).toMatchObject({
            verdict: 'new',
            change: null,
            margin: null,
        });
    });

    it('adds the two margins in quadrature', () => {
        expect(rows[0].margin).toBeCloseTo(Math.SQRT2, 10);
    });

    it('judges a tree by its run-to-run spread when that is larger than its margin', () => {
        const noisy = compareRows(
            new Map([['s: a', { ops: 1000, rme: 1, spread: 8 }]]),
            new Map([['s: a', { ops: 1050, rme: 1, spread: 0 }]]),
        );
        expect(noisy[0]).toMatchObject({ verdict: 'same' });
        expect(noisy[0].margin).toBeCloseTo(Math.hypot(8, 1), 10);
    });
});

describe('formatting', () => {
    it('prints the change with a sign, the margin and the verdict', () => {
        const rows = compareRows(
            new Map([['s: a', { ops: 2000, rme: 0.5 }]]),
            new Map([['s: a', { ops: 2200, rme: 0.5 }]]),
        );
        const lines = formatCompare(rows);
        expect(lines[0]).toMatch(/^benchmark +base ops\/s +head ops\/s +change +margin +verdict$/);
        expect(lines[1]).toMatch(/^s: a +2,000 +2,200 +\+10\.0% +\+-0\.7% +faster$/);
    });

    it('prints a new benchmark with dashes and small rates with decimals', () => {
        const lines = formatCompare(compareRows(new Map(), new Map([['s: a', { ops: 12.345, rme: 1 }]])));
        expect(lines[1]).toMatch(/^s: a +- +12\.35 +new +- +new$/);
    });

    it('prints one ops/s and margin column for a single tree', () => {
        const lines = formatResults(new Map([['s: a', { ops: 1234.5, rme: 0.123 }]]));
        expect(lines).toEqual(['benchmark  ops/s   margin', 's: a       1,235  +-0.12%']);
    });
});
