// Metric invariants over live-policy runs (docs/designs/metric-trust.md, T20c).

import { describe, expect, it } from 'vitest';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { runSeed } from '../../scripts/eval-worker.mjs';
import { runPool } from '../../scripts/lib/worker-pool.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 20_000;
const SEEDS = [1, 2, 3, 4];
const WORKER_URL = new URL('../../scripts/eval-worker.mjs', import.meta.url);
const tasks = SEEDS.map((seed) => ({ seed, ticks: TICKS, policy: 'map-elites-v6', overrides: {}, policyOptions: {} }));

/**
 * @param {Record<string, import('../../js/evo/metrics-stats.js').MetricResult>} metrics per-seed results
 * @returns {[string, number][]} metrics with a numeric value
 */
function finiteValues(metrics) {
    return Object.entries(metrics).flatMap(([name, result]) => {
        if (result.value === null) {
            return [];
        }
        return [[name, result.value]];
    });
}

describe('live metric invariants', () => {
    it(
        'keeps share and rate metrics in range and agrees between worker and in-process runs',
        async () => {
            const pooled = await runPool(tasks, { workerUrl: WORKER_URL, workers: 2 });
            for (let i = 0; i < tasks.length; i++) {
                const direct = runSeed(tasks[i]);
                expect(finiteValues(pooled[i].metrics), `seed ${tasks[i].seed}`).toEqual(finiteValues(direct.metrics));

                for (const [name, value] of finiteValues(pooled[i].metrics)) {
                    const entry = METRICS[/** @type {keyof typeof METRICS} */ (name)];
                    if (entry?.unit === 'share' && !entry.counts.includes(' minus ')) {
                        expect(value, `${name} seed ${tasks[i].seed}`).toBeGreaterThanOrEqual(0);
                        expect(value, `${name} seed ${tasks[i].seed}`).toBeLessThanOrEqual(1);
                    }
                    if (name.endsWith('_per_1k')) {
                        expect(value, `${name} seed ${tasks[i].seed}`).toBeGreaterThanOrEqual(0);
                    }
                }

                const metrics = pooled[i].metrics;
                const birthSources = Object.entries(metrics)
                    .filter(([name, result]) => name.startsWith('eval.birth_source_share.') && result.value !== null)
                    .reduce((sum, [, result]) => sum + result.value, 0);
                if (birthSources > 0) {
                    expect(birthSources, `birth sources seed ${tasks[i].seed}`).toBeCloseTo(1, 10);
                }

                const hunterIncome = ['kill', 'bite', 'carcass', 'herd']
                    .map((source) => metrics[`eval.hunter_income_share.${source}`]?.value)
                    .filter((value) => value !== null && value !== undefined);
                if (hunterIncome.length > 0) {
                    expect(
                        hunterIncome.reduce((sum, value) => sum + value, 0),
                        `hunter income seed ${tasks[i].seed}`,
                    ).toBeCloseTo(1, 10);
                }
            }
        },
        scaleTimeout(360_000),
    );
});
