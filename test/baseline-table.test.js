import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baselineTable, planMetrics, runBaselineTable } from '../scripts/baseline-table.mjs';
import { newestBaselinePath } from '../scripts/lib/baseline-report.mjs';

const REGISTRY = {
    'eval.a': { minSeeds: 32, power: { mde16: null, mde32: 0.2, mde64: 0.1 } },
    'eval.b': { minSeeds: null, power: null },
};

const REPORT = {
    metrics: {
        'eval.a': { values: [1, 2, 3, null] },
        'eval.b': { values: [null, null] },
    },
};

describe('planMetrics', () => {
    it('lists registered names once, in first-seen order, and the unregistered ones apart', () => {
        const text = 'Reads `eval.b`, then `eval.a` and `eval.b` again; `eval.nope` is new; `bench.x` too.';
        expect(planMetrics(text, { 'eval.a': 1, 'eval.b': 1 })).toEqual({
            names: ['eval.b', 'eval.a'],
            unknown: ['eval.nope', 'bench.x'],
        });
    });
});

describe('baselineTable', () => {
    it('prints mean, range, null share, power and the seeds a verdict needs', () => {
        const lines = baselineTable(REPORT, ['eval.a', 'eval.b'], REGISTRY);
        expect(lines[2]).toBe('| `eval.a` | 2 | 1 to 3 | 0.25 | - | 0.2 | 0.1 | 32 |');
        expect(lines[3]).toBe('| `eval.b` | - | - | 1 | - | - | - | more than 64 |');
    });
});

describe('runBaselineTable', () => {
    /** @param {Record<string, any>} config a config object */
    const fixture = (config) => ({
        version: 1,
        policy: 'p',
        fitnessName: 'f',
        config,
        configHash: 'h',
        ticks: 10,
        seeds: [1, 2],
        sha: 's',
        metrics: {
            'eval.alarm_rate': { values: [0.5, 1.5], reasons: [null, null], mean: 1, sd: 0.7 },
        },
    });

    it('prints the plan table from a fixture report', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'baseline-table-'));
        try {
            const report = join(dir, 'defaults-floor-on-X.json');
            const plan = join(dir, 'plan.md');
            writeFileSync(report, JSON.stringify(fixture({})));
            writeFileSync(plan, 'The plan reads `eval.alarm_rate` and `eval.not_a_metric`.\n');
            /** @type {string[]} */
            const out = [];
            await runBaselineTable(['--plan', plan, '--report', report], (line) => out.push(line));
            expect(out[0]).toBe(`Baseline: ${report} (2 seeds, 10 ticks)`);
            expect(out.some((line) => line.startsWith('| `eval.alarm_rate` | 1 | 0.5 to 1.5 | 0 |'))).toBe(true);
            expect(out).toContain('not registered: eval.not_a_metric');
            expect(newestBaselinePath(dir)).toBe(report);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses a missing plan', async () => {
        await expect(runBaselineTable([], () => {})).rejects.toThrow(/usage/);
        await expect(runBaselineTable(['--plan', 'no-such-plan-doc'], () => {})).rejects.toThrow(/no plan doc/);
    });
});
