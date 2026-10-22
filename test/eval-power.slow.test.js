import { describe, expect, it } from 'vitest';
import { configHash } from '../js/sim/config.js';
import { createRng, nextFloat } from '../js/sim/rng.js';
import { powerRow } from '../scripts/eval-power.mjs';

/**
 * @param {string} metric the metric
 * @param {number} spread the half-width of the uniform noise around 10
 * @returns {Record<string, any>} a 64-seed report with that one metric
 */
function noiseReport(metric, spread) {
    const rng = createRng(11);
    const values = Array.from({ length: 64 }, () => 10 + (nextFloat(rng) - 0.5) * 2 * spread);
    const config = { maxAgents: 100 };
    return {
        version: 1,
        policy: 'live',
        fitnessName: 'v5',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: Array.from({ length: 64 }, (_, i) => i + 1),
        sha: 'abc',
        metrics: {
            [metric]: {
                values,
                reasons: values.map(() => null),
                mean: values.reduce((a, b) => a + b, 0) / 64,
                sd: 0,
            },
        },
    };
}

describe('eval power on a hand-built report', () => {
    const report = noiseReport('eval.births_per_1k', 1);

    it('detects a planted 20% effect at 32 v 32', { timeout: 60_000 }, () => {
        const row = powerRow(report, 'eval.births_per_1k', { size: 32, splits: 40, powerSplits: 60 });
        expect(row.detectable).not.toBeNull();
        expect(/** @type {number} */ (row.detectable)).toBeLessThanOrEqual(0.2);
    });

    it('has a false-positive rate near 5% for a null metric', { timeout: 60_000 }, () => {
        const row = powerRow(report, 'eval.births_per_1k', { size: 16, splits: 300, powerSplits: 1 });
        expect(row.falsePositive).toBeLessThanOrEqual(0.12);
    });

    it('needs a larger change when the metric is noisier', { timeout: 60_000 }, () => {
        const quiet = powerRow(report, 'eval.births_per_1k', { size: 16, splits: 4, powerSplits: 40 });
        const loud = powerRow(noiseReport('eval.births_per_1k', 8), 'eval.births_per_1k', {
            size: 16,
            splits: 4,
            powerSplits: 40,
        });
        expect(/** @type {number} */ (loud.detectable ?? Infinity)).toBeGreaterThan(
            /** @type {number} */ (quiet.detectable),
        );
    });
});
