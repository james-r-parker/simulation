import { describe, expect, it } from 'vitest';
import { bootstrapInterval, compareReports, metricDirection, normalCdf, normalQuantile } from '../../js/evo/compare.js';
import { configHash } from '../../js/sim/config.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BASE = [10, 12, 9, 11, 13, 10, 12, 11];

/**
 * @param {Record<string, number[] | (number | null)[]>} metrics values per metric
 * @param {Record<string, any>} [over] report field overrides
 * @returns {Record<string, any>} a report-shaped object
 */
function report(metrics, over = {}) {
    const config = over.config ?? { maxAgents: 100, foodRate: 1 };
    return {
        version: 1,
        policy: 'live',
        fitnessName: 'v5',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: SEEDS,
        sha: 'abc',
        metrics: Object.fromEntries(
            Object.entries(metrics).map(([name, values]) => {
                const present = /** @type {number[]} */ (values.filter((v) => v !== null));
                const mean = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
                return [name, { values, reasons: values.map((v) => (v === null ? 'none' : null)), mean, sd: 0 }];
            }),
        ),
        ...over,
    };
}

const shift = (/** @type {number[]} */ v, /** @type {number} */ d) => v.map((x, i) => x + d + (i % 2) * 0.1);

describe('normal distribution', () => {
    it('matches known CDF values', () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 12);
        expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
        expect(normalCdf(-1)).toBeCloseTo(0.15865525393145707, 12);
        expect(normalCdf(3)).toBeCloseTo(0.9986501019683699, 12);
        expect(normalCdf(-10)).toBeCloseTo(7.619853024160527e-24, 30);
        expect(normalCdf(40)).toBe(1);
        expect(normalCdf(-40)).toBe(0);
    });

    it('matches known quantiles and inverts the CDF', () => {
        expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
        expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 9);
        expect(normalQuantile(0.001)).toBeCloseTo(-3.090232306167813, 9);
        for (const p of [1e-6, 0.01, 0.2, 0.5, 0.8, 0.99, 1 - 1e-6]) {
            expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 12);
        }
        expect(() => normalQuantile(0)).toThrow(/\(0, 1\)/);
    });
});

describe('bootstrapInterval', () => {
    it('is reproducible and brackets the mean of a spread sample', () => {
        const values = [1.2, 0.8, 1.5, 0.9, 1.1, 1.4, 0.7, 1.0];
        const a = bootstrapInterval(values);
        expect(bootstrapInterval(values)).toEqual(a);
        expect(a.low).toBeLessThan(1.075);
        expect(a.high).toBeGreaterThan(1.075);
        expect(bootstrapInterval(values, 0.5).high - bootstrapInterval(values, 0.5).low).toBeLessThan(a.high - a.low);
    });

    it('returns [d, d] when all values are equal', () => {
        expect(bootstrapInterval([2, 2, 2, 2])).toEqual({ low: 2, high: 2 });
        expect(bootstrapInterval([0, 0, 0])).toEqual({ low: 0, high: 0 });
    });

    it('gives a finite ordered interval when the jackknife squares underflow to 0', () => {
        const { low, high } = bootstrapInterval([0, 0, 0, 3e-170]);
        expect(Number.isFinite(low) && Number.isFinite(high)).toBe(true);
        expect(low).toBeLessThanOrEqual(high);
    });

    it('rejects a bad sample or level', () => {
        expect(() => bootstrapInterval([1])).toThrow();
        expect(() => bootstrapInterval([1, 2], 1)).toThrow();
    });
});

describe('metricDirection', () => {
    it('follows the metrics table', () => {
        expect(metricDirection('eval.diversity')).toBe('higher');
        expect(metricDirection('eval.floor_episodes')).toBe('lower');
        expect(metricDirection('eval.population_mean')).toBe('watch');
        expect(metricDirection('eval.p90_fitness.forager')).toBe('higher');
        expect(metricDirection('eval.mean_fitness.all')).toBe('higher');
        expect(metricDirection('bench.step_ms@500')).toBe('lower');
        expect(metricDirection('bench.phase_ms.physics@500')).toBe('lower');
        expect(metricDirection('browser.frame_p95_ms')).toBe('lower');
        expect(metricDirection('nope')).toBeNull();
    });
});

describe('compareReports verdicts', () => {
    const metrics = {
        'eval.diversity': BASE,
        'eval.floor_episodes': BASE,
        'eval.population_mean': BASE,
        'bench.step_ms@500': BASE,
    };

    it('gives no-difference (or -) everywhere for identical reports, in sorted order', () => {
        const { rows } = compareReports(report(metrics), report(metrics));
        expect(rows.map((r) => r.metric)).toEqual([...rows.map((r) => r.metric)].sort());
        for (const row of rows) {
            expect(['no-difference', '-']).toContain(row.verdict);
            expect(row.diff).toBe(0);
        }
    });

    it('scores a shifted metric by its direction', () => {
        const up = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, shift(v, 3)]));
        const verdicts = Object.fromEntries(
            compareReports(report(metrics), report(up)).rows.map((r) => [r.metric, r.verdict]),
        );
        expect(verdicts).toEqual({
            'bench.step_ms@500': 'worse',
            'eval.diversity': 'better',
            'eval.floor_episodes': 'worse',
            'eval.population_mean': '-',
        });
        const down = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, shift(v, -3)]));
        const back = Object.fromEntries(
            compareReports(report(metrics), report(down)).rows.map((r) => [r.metric, r.verdict]),
        );
        expect(back['eval.diversity']).toBe('worse');
        expect(back['eval.floor_episodes']).toBe('better');
        expect(back['bench.step_ms@500']).toBe('better');
    });

    it('is reproducible and independent of metric order', () => {
        const after = report({ a: shift(BASE, 0.3), 'eval.diversity': shift(BASE, 0.3) });
        const swapped = report({ 'eval.diversity': shift(BASE, 0.3), a: shift(BASE, 0.3) });
        const first = compareReports(report({ a: BASE, 'eval.diversity': BASE }), after);
        expect(compareReports(report({ a: BASE, 'eval.diversity': BASE }), after)).toEqual(first);
        expect(compareReports(report({ 'eval.diversity': BASE, a: BASE }), swapped)).toEqual(first);
    });

    it('gives - for null values, unknown metrics (with a note) and differing fitnessName', () => {
        const before = report({
            'eval.qd_score': [1, 2, 3, 4, 5, 6, 7, null],
            mystery: BASE,
            'eval.p90_fitness.all': BASE,
            'eval.diversity': BASE,
        });
        const after = report(
            {
                'eval.qd_score': [2, 3, 4, 5, 6, 7, 8, 9],
                mystery: shift(BASE, 5),
                'eval.p90_fitness.all': shift(BASE, 5),
                'eval.diversity': shift(BASE, 5),
            },
            { fitnessName: 'other' },
        );
        const rows = Object.fromEntries(compareReports(before, after).rows.map((r) => [r.metric, r]));
        expect(rows['eval.qd_score'].verdict).toBe('-');
        expect(rows['eval.qd_score'].low).toBeNull();
        expect(rows.mystery.verdict).toBe('-');
        expect(rows.mystery.note).toBe('unknown metric');
        expect(rows['eval.p90_fitness.all'].verdict).toBe('-');
        expect(rows['eval.p90_fitness.all'].note).toMatch(/fitnessName/);
        expect(rows['eval.diversity'].verdict).toBe('better');
    });

    it('skips metrics present in only one report', () => {
        const { rows } = compareReports(report({ a: BASE, b: BASE }), report({ a: BASE }));
        expect(rows.map((r) => r.metric)).toEqual(['a']);
    });
});

describe('compareReports refusals', () => {
    /**
     * @param {Record<string, any>} before before report
     * @param {Record<string, any>} after after report
     * @param {object} [options] compare options
     * @returns {string | undefined} the refusal field
     */
    function refusedField(before, after, options) {
        try {
            compareReports(before, after, options);
        } catch (err) {
            return /** @type {any} */ (err).field;
        }
        return undefined;
    }
    const m = { 'eval.diversity': BASE };

    it('refuses different seeds, ticks, configs and fewer than 8 seeds', () => {
        expect(refusedField(report(m), report(m, { seeds: [1, 2, 3, 4, 5, 6, 7, 9] }))).toBe('seeds');
        expect(refusedField(report(m), report(m, { ticks: 2000 }))).toBe('ticks');
        expect(refusedField(report(m), report(m, { config: { maxAgents: 200, foodRate: 1 } }))).toBe('config');
        expect(refusedField(report(m, { seeds: [1, 2, 3] }), report(m, { seeds: [1, 2, 3] }))).toBe('seedCount');
    });

    it('names the differing keys, and allowConfigDiff lets a named key differ', () => {
        const other = report(m, { config: { maxAgents: 200, foodRate: 1 } });
        expect(() => compareReports(report(m), other)).toThrow(/maxAgents/);
        expect(refusedField(report(m), other, { allowConfigDiff: ['maxAgents'] })).toBeUndefined();
        const both = report(m, { config: { maxAgents: 200, foodRate: 2 } });
        expect(refusedField(report(m), both, { allowConfigDiff: ['maxAgents'] })).toBe('config');
    });

    it('allowSeedDiff pairs by position but still needs equal counts, ticks and 8 seeds', () => {
        const other = report(m, { seeds: [9, 10, 11, 12, 13, 14, 15, 16] });
        expect(refusedField(report(m), other, { allowSeedDiff: true })).toBeUndefined();
        expect(compareReports(report(m), other, { allowSeedDiff: true }).paired).toBe(false);
        expect(compareReports(report(m), report(m)).paired).toBe(true);
        expect(refusedField(report(m), report(m, { seeds: [9, 10, 11] }), { allowSeedDiff: true })).toBe('seeds');
        expect(refusedField(report(m), { ...other, ticks: 5 }, { allowSeedDiff: true })).toBe('ticks');
        const few = { seeds: [1, 2, 3] };
        expect(refusedField(report(m, few), report(m, { seeds: [4, 5, 6] }), { allowSeedDiff: true })).toBe(
            'seedCount',
        );
    });

    it('allows different policies', () => {
        expect(refusedField(report(m), report(m, { policy: 'baseline-v5' }))).toBeUndefined();
    });
});
