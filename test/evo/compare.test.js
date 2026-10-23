import { describe, expect, it } from 'vitest';
import {
    bootstrapInterval,
    compareReports,
    metricDirection,
    MIN_EFFECT,
    normalCdf,
    normalQuantile,
} from '../../js/evo/compare.js';
import { configHash } from '../../js/sim/config.js';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const BASE = [10, 12, 9, 11, 13, 10, 12, 11, 10, 12, 9, 11, 13, 10, 12, 11];

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

/** Metrics whose eval:power false-positive rate exceeded 10% at 16 seeds on E29 (world-balance T41, T42, T70). */
const WATCH_MOVED_BY_T41 = [
    'eval.alarm_precision',
    'eval.deliberate_food_share',
    'eval.diversity',
    'eval.evasion_skill',
    'eval.hunt_call_answer',
    'eval.pursuit_bite_share',
    'eval.smoke_precision',
];

describe('metricDirection', () => {
    it('follows the metrics table', () => {
        expect(metricDirection('eval.births_per_1k')).toBe('higher');
        expect(metricDirection('eval.floor_episodes')).toBe('lower');
        expect(metricDirection('eval.population_mean')).toBe('watch');
        expect(metricDirection('eval.born_share')).toBe('watch');
        expect(metricDirection('eval.mating_share')).toBe('watch');
        for (const metric of WATCH_MOVED_BY_T41) {
            expect(metricDirection(metric)).toBe('watch');
        }
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
        'eval.births_per_1k': BASE,
        'browser.frame_p95_ms': BASE,
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
            'eval.births_per_1k': 'better',
            'browser.frame_p95_ms': 'worse',
            'eval.population_mean': '-',
        });
        const down = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, shift(v, -3)]));
        const back = Object.fromEntries(
            compareReports(report(metrics), report(down)).rows.map((r) => [r.metric, r.verdict]),
        );
        expect(back['eval.births_per_1k']).toBe('worse');
        expect(back['browser.frame_p95_ms']).toBe('better');
        expect(back['bench.step_ms@500']).toBe('better');
    });

    it('gives no-difference for a tiny shift whose interval excludes 0, and a verdict past 5%', () => {
        const tiny = { 'eval.births_per_1k': shift(BASE, 0.3) };
        const [small] = compareReports(report({ 'eval.births_per_1k': BASE }), report(tiny)).rows;
        expect(small.low).toBeGreaterThan(0);
        expect(small.verdict).toBe('no-difference');
        expect(small.effect).toBeCloseTo(0.35 / 11.1875, 2);
        const big = compareReports(
            report({ 'eval.births_per_1k': BASE }),
            report({ 'eval.births_per_1k': shift(BASE, 0.7) }),
        );
        expect(big.rows[0].effect).toBeGreaterThan(0.05);
        expect(big.rows[0].verdict).toBe('better');
        expect(big.minEffect).toBe(MIN_EFFECT);
        expect(big.seedCount).toBe(16);
    });

    it('uses |after mean| when the before mean is 0, and no-difference when both are 0', () => {
        const zeros = BASE.map(() => 0);
        const alt = BASE.map((_, i) => 1 + (i % 2) * 0.1);
        const [grown] = compareReports(
            report({ 'eval.births_per_1k': zeros }),
            report({ 'eval.births_per_1k': alt }),
        ).rows;
        expect(grown.effect).toBeCloseTo(1, 12);
        expect(grown.verdict).toBe('better');
        const [flat] = compareReports(
            report({ 'eval.births_per_1k': zeros }),
            report({ 'eval.births_per_1k': zeros }),
        ).rows;
        expect(flat.effect).toBeNull();
        expect(flat.verdict).toBe('no-difference');
    });

    it('minEffect overrides the threshold', () => {
        const before = report({ 'eval.births_per_1k': BASE });
        const after = report({ 'eval.births_per_1k': shift(BASE, 0.3) });
        expect(compareReports(before, after, { minEffect: 0.01 }).rows[0].verdict).toBe('better');
        expect(compareReports(before, after, { minEffect: 0.5 }).rows[0].verdict).toBe('no-difference');
        expect(compareReports(before, after, { minEffect: 0 }).rows[0].verdict).toBe('better');
    });

    it('is reproducible and independent of metric order', () => {
        const after = report({ a: shift(BASE, 0.3), 'eval.births_per_1k': shift(BASE, 0.3) });
        const swapped = report({ 'eval.births_per_1k': shift(BASE, 0.3), a: shift(BASE, 0.3) });
        const first = compareReports(report({ a: BASE, 'eval.births_per_1k': BASE }), after);
        expect(compareReports(report({ a: BASE, 'eval.births_per_1k': BASE }), after)).toEqual(first);
        expect(compareReports(report({ 'eval.births_per_1k': BASE, a: BASE }), swapped)).toEqual(first);
    });

    it('gives - for null values, unknown metrics (with a note) and differing fitnessName', () => {
        const before = report({
            'eval.qd_score': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, null],
            mystery: BASE,
            'eval.p90_fitness.all': BASE,
            'eval.births_per_1k': BASE,
        });
        const after = report(
            {
                'eval.qd_score': [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
                mystery: shift(BASE, 5),
                'eval.p90_fitness.all': shift(BASE, 5),
                'eval.births_per_1k': shift(BASE, 5),
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
        expect(rows['eval.births_per_1k'].verdict).toBe('better');
    });

    it('gives a 16-seed report no verdict on a metric that needs 32 seeds, and the note `needs 32 seeds`', () => {
        const before = report({ 'eval.floor_episodes': BASE, 'eval.births_per_1k': BASE });
        const after = report({ 'eval.floor_episodes': shift(BASE, -5), 'eval.births_per_1k': shift(BASE, 5) });
        const rows = Object.fromEntries(compareReports(before, after).rows.map((r) => [r.metric, r]));
        expect(rows['eval.floor_episodes']).toMatchObject({ verdict: '-', note: 'needs 32 seeds', minSeeds: 32 });
        expect(rows['eval.floor_episodes'].low).toBeNull();
        expect(rows['eval.births_per_1k']).toMatchObject({ verdict: 'better', minSeeds: 16 });
        expect(rows['eval.births_per_1k'].note).toBeUndefined();
    });

    it('gives a verdict on a 32-seed metric once the reports carry 32 seeds', () => {
        const seeds = Array.from({ length: 32 }, (_, i) => i + 1);
        const wide = [...BASE, ...BASE];
        const before = report({ 'eval.floor_episodes': wide }, { seeds });
        const after = report({ 'eval.floor_episodes': shift(wide, -5) }, { seeds });
        const [row] = compareReports(before, after).rows;
        expect(row).toMatchObject({ verdict: 'better', minSeeds: 32 });
        expect(row.note).toBeUndefined();
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
    const m = { 'eval.births_per_1k': BASE };

    it('refuses different seeds, ticks, configs and fewer than 16 seeds', () => {
        expect(refusedField(report(m), report(m, { seeds: [...SEEDS.slice(0, 15), 17] }))).toBe('seeds');
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

    it('allowConfigDiff tolerates a key present in one config and absent in the other', () => {
        const old = report(m, { config: { maxAgents: 200, foodRate: 1, childEnergy: 600 } });
        const next = report(m, { config: { maxAgents: 200, foodRate: 1, childEnergyShare: 0.4, mateRange: 100 } });
        const allow = { allowConfigDiff: ['childEnergy', 'childEnergyShare', 'mateRange'] };
        expect(refusedField(old, next, allow)).toBeUndefined();
        expect(refusedField(next, old, allow)).toBeUndefined();
        expect(() => compareReports(old, next, { allowConfigDiff: ['childEnergy'] })).toThrow(
            /childEnergyShare, mateRange/,
        );
        expect(refusedField(old, next)).toBe('config');
    });

    it('allowSeedDiff pairs by position but still needs equal counts, ticks and 16 seeds', () => {
        const other = report(m, { seeds: SEEDS.map((x) => x + 16) });
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
