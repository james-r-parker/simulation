import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, parseJsonOutput, readPower, renderPowerModule } from '../scripts/metric-power-write.mjs';
import { withPower } from '../js/evo/metric-registry/index.js';

const names = ['x.at16', 'x.at32', 'x.never', 'x.share', 'x.unknown'];
const metrics = /** @type {any} */ (
    Object.fromEntries(
        names.slice(0, 4).map((name) => [name, { unit: name === 'x.share' ? 'share' : 'count', renamedFrom: [] }]),
    )
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
/** @type {string[]} */
const tempDirs = [];

afterEach(() => {
    for (const path of tempDirs.splice(0)) {
        rmSync(path, { recursive: true, force: true });
    }
});

describe('metric-power-write', () => {
    it('reads the JSON object from npm run output', () => {
        expect(parseJsonOutput('> eval:power\n> node scripts/eval-power.mjs\n\n{"rows":[]}')).toEqual({ rows: [] });
        expect(() => parseJsonOutput('no JSON here')).toThrow('no JSON object in command output');
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
            fpr64: null,
            mde16: 0.15,
            mde32: 0.3,
            mde64: null,
            referenceMean: 2,
            report: 'evals/power/sample.json',
        });
    });

    it('reads 64-seed rows, assigns minSeeds 64 when only 64 meets the bar, and renders the 64 columns', () => {
        const only64 = [
            { metric: 'x.at16', size: 16, falsePositive: 0.05, detectable: 0.5 },
            { metric: 'x.at16', size: 32, falsePositive: 0.05, detectable: 0.3 },
            { metric: 'x.at16', size: 64, falsePositive: 0.04, detectable: 0.2 },
        ];
        const readings = readPower({ rows: only64 }, report, 'evals/power/sample.json', metrics);
        expect(readings['x.at16']).toMatchObject({ fpr64: 0.04, mde64: 0.2 });
        const entries = { 'x.at16': { ...metrics['x.at16'], minSeeds: null } };
        expect(withPower(entries, readings)['x.at16'].minSeeds).toBe(64);
        const source = renderPowerModule(readings);
        expect(source).toContain('fpr64: 0.04,');
        expect(source).toContain('mde64: 0.2,');
        expect(renderPowerModule(readPower({ rows }, report, 'r.json', metrics))).toContain('fpr64: null,');
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

    it('rejects malformed rows and rows whose report has no source answer', () => {
        expect(() => readPower({ rows: null }, report, 'report.json', metrics)).toThrow('power JSON must contain rows');
        expect(() =>
            readPower(
                { rows: [{ metric: 'x.at16', size: 16, falsePositive: 0.05, detectable: 0.1 }] },
                { ...report, metrics: {} },
                'report.json',
                metrics,
            ),
        ).toThrow('source report lacks metric x.at16');
        expect(
            readPower(
                { rows: [{ metric: 'x.at16', size: 8, falsePositive: 0, detectable: null }] },
                report,
                'report.json',
                metrics,
            ),
        ).toEqual({});
    });

    it('validates CLI arguments, reads both documents and writes the generated map', () => {
        const directory = mkdtempSync(join(tmpdir(), 'metric-power-write-'));
        tempDirs.push(directory);
        const output = join(directory, 'power.js');
        const read = (/** @type {string} */ path) => (path === 'power.json' ? { rows } : report);
        const print = () => {};

        expect(main(['power.json', '--report', 'report.json'], { metrics, read, print })).toBe(0);
        expect(main(['power.json', '--report', 'report.json', '--write'], { metrics, output, read, print })).toBe(0);
        expect(readFileSync(output, 'utf8')).toContain("'x.at16': Object.freeze({");
        expect(main(['--report', 'report.json'], { metrics, read, print })).toBe(2);
        expect(main(['power.json', '--report', 'report.json', '--unsupported'], { metrics, read, print })).toBe(2);
        expect(main(['power.json', '--report', 'report.json'], { metrics, read: () => ({}), print })).toBe(1);
    });

    it('reads the JSON files when the CLI has no injected reader', () => {
        const directory = mkdtempSync(join(tmpdir(), 'metric-power-write-files-'));
        tempDirs.push(directory);
        const powerPath = join(directory, 'power.json');
        const reportPath = join(directory, 'report.json');
        writeFileSync(powerPath, JSON.stringify({ rows }));
        writeFileSync(reportPath, JSON.stringify(report));
        expect(main([powerPath, '--report', reportPath], { metrics, print: () => {} })).toBe(0);
    });
});
