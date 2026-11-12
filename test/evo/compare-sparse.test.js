import { describe, expect, it } from 'vitest';
import { compareReports } from '../../js/evo/compare.js';
import { sparseSignP } from '../../js/evo/compare-rules.js';
import { configHash } from '../../js/sim/config.js';

const SEEDS = Array.from({ length: 32 }, (_, i) => i + 1);
const BASE = SEEDS.map((_, i) => 100 + (i % 7));
const METRIC = 'eval.births_per_1k';

/**
 * @param {number[]} values per-seed values
 * @returns {Record<string, any>} a report
 */
function report(values) {
    const config = { maxAgents: 100 };
    return {
        version: 1,
        policy: 'live',
        fitnessName: 'v6',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: SEEDS,
        sha: 'abc',
        metrics: {
            [METRIC]: { values, reasons: values.map(() => null), mean: values.reduce((a, b) => a + b, 0) / 32, sd: 0 },
        },
    };
}

/** @param {number} k how many seeds drop by 100 @returns {import('../../js/evo/compare.js').CompareRow} the row */
const sparse = (k) => compareReports(report(BASE), report(BASE.map((v, i) => (i < k ? v - 100 : v)))).rows[0];

describe('sparseSignP', () => {
    it('is null for dense differences and the exact sign p for sparse ones', () => {
        expect(sparseSignP([1, -1, 2, 0])).toBeNull();
        expect(sparseSignP([0, 0, -1, -1])).toBe(0.5);
        expect(sparseSignP([...Array(26).fill(0), ...Array(6).fill(-3)])).toBeCloseTo(0.03125, 12);
        expect(sparseSignP([0, 0, 0, 0])).toBe(1);
    });
});

describe('compareReports on sparse paired differences (T29c)', () => {
    it('keeps 2 of 32 at a drop of 100 as no-difference, with the sign p in the note', () => {
        expect(sparse(2)).toMatchObject({ verdict: 'no-difference', note: 'sparse: sign p 0.5' });
        expect(sparse(2).high).toBeLessThan(0);
    });

    it('gives 6 of 32 the verdict worse, and 5 of 32 not', () => {
        expect(sparse(6)).toMatchObject({ verdict: 'worse' });
        expect(sparse(6).note).toBeUndefined();
        expect(sparse(5).verdict).toBe('no-difference');
    });

    it('keeps the BCa verdict of a dense shift, and a sparse rise reads better', () => {
        const dense = compareReports(report(BASE), report(BASE.map((v, i) => v + 8 + (i % 2) * 0.1))).rows[0];
        expect(dense.verdict).toBe('better');
        expect(dense.note).toBeUndefined();
        const rise = compareReports(report(BASE), report(BASE.map((v, i) => (i < 6 ? v + 100 : v)))).rows[0];
        expect(rise.verdict).toBe('better');
    });
});
