import { describe, expect, it } from 'vitest';
import { parseJsonOutput, readPower } from '../scripts/metric-power-write.mjs';
import { withPower } from '../js/evo/metric-registry/index.js';

const names = ['x.at16', 'x.at32', 'x.never', 'x.share', 'x.unknown'];
const metrics = Object.fromEntries(
    names.slice(0, 4).map((name) => [name, { unit: name === 'x.share' ? 'share' : 'count', renamedFrom: [] }]),
);
const report = {
    version: 1,
    policy: 'live',
    fitnessName: 'fitness',
    config: {},
    configHash: 'hash',
    ticks: 10,
    seeds: [1, 2],
    sha: 'abc',
    metrics: Object.fromEntries(
        names.slice(0, 4).map((name) => [name, { values: [1, 3], reasons: [null, null], mean: 2, sd: 1 }]),
    ),
};
const rows = names.slice(0, 4).flatMap((metric) => [
    {
        metric,
        size: 16,
        falsePositive: 0.05,
        detectable: metric === 'x.at16' ? 0.15 : metric === 'x.share' ? 0.02 : 0.3,
    },
    { metric, size: 32, falsePositive: 0.05, detectable: metric === 'x.at32' ? 0.15 : 0.3 },
]);

describe('metric-power-write', () => {
    it('reads the JSON object from npm run output', () => {
        expect(parseJsonOutput('> eval:power\n> node scripts/eval-power.mjs\n\n{"rows":[]}')).toEqual({ rows: [] });
    });

    it('assigns 16, 32 or null through the shared power bar, including the share absolute bar', () => {
        const readings = readPower({ rows }, report, 'evals/power/sample.json', metrics);
        const entries = Object.fromEntries(
            Object.entries(metrics).map(([name, value]) => [name, { ...value, minSeeds: null }]),
        );
        const applied = withPower(entries, readings);
        expect(applied['x.at16'].minSeeds).toBe(16);
        expect(applied['x.at32'].minSeeds).toBe(32);
        expect(applied['x.never'].minSeeds).toBeNull();
        expect(applied['x.share'].minSeeds).toBe(16);
        expect(applied['x.at16'].power).toEqual({
            fpr16: 0.05,
            fpr32: 0.05,
            mde16: 0.15,
            mde32: 0.3,
            referenceMean: 2,
            report: 'evals/power/sample.json',
        });
    });

    it('fails when the power JSON contains an unregistered name', () => {
        expect(() =>
            readPower(
                { rows: [{ metric: 'x.unknown', size: 16, falsePositive: 0, detectable: 0.1 }] },
                report,
                'report.json',
                metrics,
            ),
        ).toThrow('power JSON holds unregistered metrics: x.unknown');
    });
});
