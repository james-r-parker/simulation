import { describe, expect, it } from 'vitest';
import { compareReports } from '../../js/evo/compare.js';
import { SHARE_MIN_EFFECT } from '../../js/evo/compare-rules.js';
import { configHash } from '../../js/sim/config.js';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const BASE = [10, 12, 9, 11, 13, 10, 12, 11, 10, 12, 9, 11, 13, 10, 12, 11];

/**
 * @param {Record<string, number[]>} metrics values per metric
 * @returns {Record<string, any>} a report-shaped object
 */
function report(metrics) {
    const config = { maxAgents: 100, foodRate: 1 };
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
            Object.entries(metrics).map(([name, values]) => [
                name,
                {
                    values,
                    reasons: values.map(() => null),
                    mean: values.reduce((a, b) => a + b, 0) / values.length,
                    sd: 0,
                },
            ]),
        ),
    };
}

describe('compareReports on a share metric (a watch metric, so a direction is named)', () => {
    const born = Array.from({ length: 16 }, (_, i) => 0.9 + i * 0.001);
    const up = (/** @type {number} */ d) => born.map((v) => v + d);
    const verdict = (/** @type {number} */ d, /** @type {object} */ options = {}) =>
        compareReports(report({ 'eval.born_share': born }), report({ 'eval.born_share': up(d) }), {
            status: () => 'verified',
            direction: () => 'higher',
            ...options,
        }).rows[0].verdict;

    it('sits at 0.02 on either side, in both directions', () => {
        expect(SHARE_MIN_EFFECT).toBe(0.02);
        expect(verdict(0.0199)).toBe('no-difference');
        expect(verdict(0.02)).toBe('better');
        expect(verdict(-0.0199)).toBe('no-difference');
        expect(verdict(-0.021)).toBe('worse');
    });

    it('sees 0.03 on a share near 1, which 0.05 of the mean (0.046) would refuse', () => {
        expect(verdict(0.03)).toBe('better');
    });

    it('ignores the relative minEffect, and reads shareMinEffect instead', () => {
        expect(verdict(0.03, { minEffect: 0.5 })).toBe('better');
        expect(verdict(0.03, { shareMinEffect: 0.05 })).toBe('no-difference');
        expect(
            compareReports(report({ 'eval.born_share': born }), report({ 'eval.born_share': up(0) })).shareMinEffect,
        ).toBe(0.02);
    });

    it('leaves a metric that is not a share on the relative floor', () => {
        const diffs = (/** @type {number} */ d) =>
            compareReports(
                report({ 'eval.births_per_1k': BASE }),
                report({ 'eval.births_per_1k': BASE.map((v) => v + d) }),
            ).rows[0].verdict;
        expect(diffs(0.5)).toBe('no-difference');
        expect(diffs(0.6)).toBe('better');
    });
});
