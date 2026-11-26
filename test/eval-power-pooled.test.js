import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareReports } from '../js/evo/compare.js';
import { configHash } from '../js/sim/config.js';
import { pooledEstimate } from '../js/evo/report-pooled.js';
import { evalPower, powerRow } from '../scripts/eval-power.mjs';

/**
 * @param {Record<string, { num: number, den: number }[]>} pooled the cells of each pooled metric, one per seed
 * @returns {Record<string, any>} a report
 */
function report(pooled) {
    const config = { maxAgents: 100 };
    const count = Object.values(pooled)[0].length;
    return {
        version: 1,
        policy: 'live',
        fitnessName: 'v6',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: Array.from({ length: count }, (_, i) => i + 1),
        sha: 'abc',
        metrics: Object.fromEntries(
            Object.entries(pooled).map(([name, cells]) => {
                const values = cells.map((c) => (c.den > 0 ? c.num / c.den : null));
                const reasons = values.map((v) => (v === null ? 'none' : null));
                return [name, { values, reasons, mean: pooledEstimate(cells), sd: 0, pooled: cells }];
            }),
        ),
    };
}

// Rate 0.30 with some seed-to-seed spread; seeds of very unequal exposure; every 7th seed has none.
const CELLS = Array.from({ length: 64 }, (_, i) => {
    const den = i % 7 === 3 ? 0 : 10 + ((i * 13) % 90);
    return { num: den * (0.3 + ((i % 5) - 2) * 0.01), den };
});
const NAME = 'eval.bite_idle';
const base = { size: 16, splits: 40, powerSplits: 20 };

describe('eval:power on a pooled metric', () => {
    it('gives a verdict with seeds of no exposure in the arms, which a non-pooled report would refuse', () => {
        const row = powerRow(report({ [NAME]: CELLS }), NAME, base);
        expect(row.note).toBeUndefined();
        expect(row.validShare).toBe(1);
        expect(row.falsePositive).not.toBeNull();
    });

    it('plants the shift on the pooled rate: the shift is planted on the ratio of sums, in absolute steps for a share', () => {
        const row = powerRow(report({ [NAME]: CELLS }), NAME, { ...base, size: 16 });
        expect(row.detectable).not.toBeNull();
        expect(row.detectableKind).toBe('absolute');
        expect(row.detectable).toBeLessThanOrEqual(0.2);
    });

    it('reads the seeds the same whatever order they are listed in (whole seeds are the unit)', () => {
        const reversed = [...CELLS].reverse();
        const a = powerRow(report({ [NAME]: CELLS }), NAME, base);
        const b = powerRow(report({ [NAME]: reversed }), NAME, base);
        expect(b.validShare).toBe(a.validShare);
        expect(Math.abs((b.falsePositive ?? 0) - (a.falsePositive ?? 0))).toBeLessThanOrEqual(0.1);
    });

    it('is replayable, and evalPower covers it beside non-pooled metrics', () => {
        const flat = CELLS.map((c) => (c.den > 0 ? c.num / c.den : 0.3));
        const r = report({ [NAME]: CELLS });
        r.metrics['eval.born_share'] = {
            values: flat,
            reasons: flat.map(() => null),
            mean: flat.reduce((t, v) => t + v, 0) / 64,
            sd: 0,
        };
        const opts = { splits: 10, powerSplits: 6, sizes: [16], metrics: [] };
        const rows = evalPower(r, opts);
        expect(rows.map((x) => x.metric)).toEqual(['eval.bite_idle', 'eval.born_share']);
        expect(evalPower(r, opts)).toEqual(rows);
    });
});

describe('a report with no pooled metric', () => {
    it('reads byte for byte as it did before pooled metrics (compare rows and power rows of a committed report)', () => {
        const full = JSON.parse(readFileSync('evals/power/defaults-floor-on-E276.json', 'utf8'));
        const names = [
            'eval.bite_idle',
            'eval.carcass_hunter_share',
            'eval.hunter_catches_per_1k_settled',
            'eval.births_per_1k',
            'eval.born_share',
        ];
        expect(names.some((name) => 'pooled' in full.metrics[name])).toBe(false);
        const part = (/** @type {number} */ from, /** @type {number} */ to) => ({
            ...full,
            seeds: full.seeds.slice(from, to),
            metrics: Object.fromEntries(
                names.map((name) => [
                    name,
                    {
                        ...full.metrics[name],
                        values: full.metrics[name].values.slice(from, to),
                        reasons: full.metrics[name].reasons.slice(from, to),
                    },
                ]),
            ),
        });
        const { rows } = compareReports(part(0, 32), part(32, 64), { allowSeedDiff: true, status: () => 'verified' });
        const power = names.map((name) =>
            powerRow(full, name, { size: 16, splits: 30, powerSplits: 10, includeWatch: true }),
        );
        const digest = createHash('sha256')
            .update(JSON.stringify({ rows, pr: power }))
            .digest('hex');
        // Recorded from the code before this change, on the same report.
        expect(digest).toBe('886130957f36ada3669a8c664b8fcd0c28c2d778ce1eccbaa1d06e6289d49493');
    });
});
