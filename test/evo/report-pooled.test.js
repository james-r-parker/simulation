import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { buildReport, validateReport } from '../../js/evo/report.js';
import { checkPooled, pooledCells, pooledEstimate, pooledResult } from '../../js/evo/report-pooled.js';

const config = createConfig({ seed: 7, maxAgents: 600, eventCapacity: 8192 });

/** @param {Record<string, any>[]} perSeed one metrics object per seed @returns {Record<string, any>} a report */
function build(perSeed) {
    return buildReport({
        policy: 'p',
        fitnessName: 'v6',
        config,
        ticks: 100,
        seeds: perSeed.map((_, i) => i + 1),
        sha: 'abc',
        perSeed,
    });
}

describe('pooledResult', () => {
    it('carries the value as num / den, with the sums next to it', () => {
        expect(pooledResult(3, 4, 'none')).toEqual({ value: 0.75, num: 3, den: 4 });
    });

    it('gives a seed with no opportunities zero exposure and a null value with its reason', () => {
        expect(pooledResult(0, 0, 'no opportunities')).toEqual({
            value: null,
            reason: 'no opportunities',
            num: 0,
            den: 0,
        });
    });
});

describe('pooledEstimate', () => {
    it('is the ratio of sums, not the mean of the seed ratios', () => {
        const cells = [
            { num: 1, den: 1 },
            { num: 1, den: 9 },
        ];
        expect(pooledEstimate(cells)).toBe(0.2);
        expect((1 / 1 + 1 / 9) / 2).not.toBe(0.2);
    });

    it('lets a zero-exposure seed contribute nothing, and is null when the whole arm has none', () => {
        expect(
            pooledEstimate([
                { num: 0, den: 0 },
                { num: 2, den: 8 },
            ]),
        ).toBe(0.25);
        expect(
            pooledEstimate([
                { num: 0, den: 0 },
                { num: 0, den: 0 },
            ]),
        ).toBeNull();
    });
});

describe('pooledCells', () => {
    it('is undefined for a metric no seed gave sufficient statistics for', () => {
        expect(pooledCells([{ value: 1 }, { value: null, reason: 'x' }])).toBeUndefined();
    });

    it('reads a seed without them as zero exposure', () => {
        expect(pooledCells([{ value: 0.5, num: 1, den: 2 }, undefined])).toEqual([
            { num: 1, den: 2 },
            { num: 0, den: 0 },
        ]);
    });
});

describe('buildReport with a pooled metric', () => {
    const perSeed = [
        { 'pooled.p': pooledResult(1, 4, 'none'), 'plain.q': { value: 1 } },
        { 'pooled.p': pooledResult(0, 0, 'no opportunities'), 'plain.q': { value: 2 } },
        { 'pooled.p': pooledResult(3, 6, 'none'), 'plain.q': { value: 3 } },
    ];

    it('stores per-seed sufficient statistics, the per-seed value as num / den, and the pooled estimate as the mean', () => {
        const metric = build(perSeed).metrics['pooled.p'];
        expect(metric.pooled).toEqual([
            { num: 1, den: 4 },
            { num: 0, den: 0 },
            { num: 3, den: 6 },
        ]);
        expect(metric.values).toEqual([0.25, null, 0.5]);
        expect(metric.reasons).toEqual([null, 'no opportunities', null]);
        expect(metric.mean).toBe(0.4);
    });

    it('leaves a metric without sufficient statistics exactly as it was', () => {
        const metric = build(perSeed).metrics['plain.q'];
        expect(metric).not.toHaveProperty('pooled');
        expect(metric.mean).toBe(2);
    });

    it('has a null mean when no seed had an opportunity', () => {
        const none = pooledResult(0, 0, 'no opportunities');
        const report = build([{ 'pooled.p': none }, { 'pooled.p': none }]);
        expect(report.metrics['pooled.p'].mean).toBeNull();
        expect(() => validateReport(report)).not.toThrow();
    });

    it('validates and survives a JSON round trip', () => {
        const report = build(perSeed);
        const back = JSON.parse(JSON.stringify(report));
        expect(back).toEqual(report);
        expect(() => validateReport(back)).not.toThrow();
    });
});

describe('validateReport on a pooled metric', () => {
    /** @param {(metric: Record<string, any>) => void} damage @returns {Record<string, any>} a report with the metric damaged */
    function damaged(damage) {
        const report = build([{ 'pooled.p': pooledResult(1, 4, 'none') }, { 'pooled.p': pooledResult(3, 6, 'none') }]);
        damage(report.metrics['pooled.p']);
        return report;
    }

    it('rejects a list of the wrong length, a cell that is not two finite numbers and a negative exposure', () => {
        expect(() => validateReport(damaged((m) => (m.pooled = [{ num: 1, den: 4 }])))).toThrow(
            /metrics.pooled.p.pooled must be an array of 2/,
        );
        expect(() => validateReport(damaged((m) => (m.pooled[0] = { num: 'x', den: 4 })))).toThrow(/pooled\[0\]/);
        expect(() => validateReport(damaged((m) => (m.pooled[0] = { num: 1, den: -4 })))).toThrow(/pooled\[0\]/);
    });

    it('rejects a value that is not num / den, and a null value with exposure', () => {
        expect(() => validateReport(damaged((m) => (m.values[0] = 0.5)))).toThrow(/pooled\[0\]/);
        expect(() => checkPooled({ values: [null], reasons: ['x'], pooled: [{ num: 1, den: 2 }] }, 'm', 1)).toThrow(
            /m.pooled\[0\]/,
        );
    });

    it('rejects a number with no exposure behind it', () => {
        expect(() => checkPooled({ values: [0], reasons: [null], pooled: [{ num: 0, den: 0 }] }, 'm', 1)).toThrow(
            /m.pooled\[0\]/,
        );
    });
});
