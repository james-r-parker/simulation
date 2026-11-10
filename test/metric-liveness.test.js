// The per-metric liveness read and generated registry data (docs/designs/metric-trust.md, T23, T25).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, measureLiveness, renderLivenessModule } from '../scripts/metric-liveness.mjs';
import { METRICS as REGISTRY } from '../js/evo/metric-registry/index.js';

const [SAMPLE, FLAT] = Object.keys(REGISTRY);
const METRICS = { [SAMPLE]: { renamedFrom: [] }, [FLAT]: { renamedFrom: [] } };
const REPORT = {
    version: 1,
    policy: 'live',
    fitnessName: 'fitness-v6',
    config: {},
    configHash: 'hash',
    ticks: 10,
    seeds: [1, 2, 3, 4],
    sha: 'abc123',
    metrics: {
        [SAMPLE]: {
            values: [null, 0, 0, 1],
            reasons: ['not seen', null, null, null],
            mean: 1 / 3,
            sd: 1 / Math.sqrt(3),
        },
        [FLAT]: {
            values: [null, null, 5, 5],
            reasons: ['off', 'off', null, null],
            mean: 5,
            sd: 0,
        },
    },
};
/** @type {string | undefined} */
let directory;

afterEach(() => {
    if (directory !== undefined) {
        rmSync(directory, { recursive: true, force: true });
        directory = undefined;
    }
});

describe('measureLiveness', () => {
    it('counts null seeds and distinct non-null values', () => {
        expect(measureLiveness(REPORT, 'evals/sample.json', METRICS)).toEqual({
            [FLAT]: { nullShare: 0.5, distinct: 1, report: 'evals/sample.json' },
            [SAMPLE]: { nullShare: 0.25, distinct: 2, report: 'evals/sample.json' },
        });
    });

    it('rejects a report holding a metric the registry does not know', () => {
        expect(() => measureLiveness(REPORT, 'report.json', { [SAMPLE]: { renamedFrom: [] } })).toThrow(
            `report holds unregistered metrics: ${FLAT}`,
        );
    });

    it('reads an old name through renamedFrom and gives a metric the report lacks no reading', () => {
        const metrics = {
            'x.sample_p50': { renamedFrom: [SAMPLE] },
            [FLAT]: { renamedFrom: [] },
            'x.added_later': { renamedFrom: [] },
        };
        expect(measureLiveness(REPORT, 'evals/sample.json', metrics)).toEqual({
            [FLAT]: { nullShare: 0.5, distinct: 1, report: 'evals/sample.json' },
            'x.sample_p50': { nullShare: 0.25, distinct: 2, report: 'evals/sample.json' },
        });
    });
});

describe('metric-liveness CLI', () => {
    it('prints the liveness bar result and writes generated readings when requested', () => {
        directory = mkdtempSync(join(tmpdir(), 'metric-liveness-'));
        const output = join(directory, 'liveness.js');
        /** @type {string[]} */
        const lines = [];
        const exit = main(['evals/sample.json', '--write'], {
            metrics: METRICS,
            output,
            read: () => REPORT,
            print: (line) => lines.push(line),
        });
        const generated = readFileSync(output, 'utf8');
        expect(exit).toBe(0);
        expect(lines).toContain(`${SAMPLE} null=25.0% distinct=2 flat`);
        expect(lines).toContain(`${FLAT} null=50.0% distinct=1 flat`);
        expect(generated).toContain(`'${SAMPLE}': Object.freeze({\n        nullShare: 0.25,`);
        expect(renderLivenessModule(measureLiveness(REPORT, 'evals/sample.json', METRICS))).toBe(generated);
    });

    it('reads the report from disk, and exits 1 with the reason when the report holds an unregistered metric', () => {
        directory = mkdtempSync(join(tmpdir(), 'metric-liveness-'));
        const path = join(directory, 'report.json');
        writeFileSync(path, JSON.stringify(REPORT));
        /** @type {string[]} */
        const lines = [];
        expect(main([path], { metrics: METRICS, print: (line) => lines.push(line) })).toBe(0);
        expect(lines).toHaveLength(2);
        const errors = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        expect(main([path], { metrics: { [SAMPLE]: { renamedFrom: [] } }, print: () => {} })).toBe(1);
        expect(errors).toHaveBeenCalledWith(`report holds unregistered metrics: ${FLAT}\n`);
        errors.mockRestore();
    });

    it('renders an empty map with no readings, and reports a thrown non-Error as text', () => {
        expect(renderLivenessModule({})).toContain('export const LIVENESS = Object.freeze({});');
        const errors = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const read = () => {
            throw 'unreadable';
        };
        expect(main(['report.json'], { metrics: METRICS, read, print: () => {} })).toBe(1);
        expect(errors).toHaveBeenCalledWith('unreadable\n');
        errors.mockRestore();
    });

    it('sorts the generated readings by name and prints a reading that meets the bar as live, to stdout by default', () => {
        const live = { nullShare: 0, distinct: 3, report: 'evals/sample.json' };
        const source = renderLivenessModule({ 'x.zeta': live, 'x.alpha': live });
        expect(source.indexOf("'x.alpha'")).toBeLessThan(source.indexOf("'x.zeta'"));
        const many = { ...REPORT.metrics[SAMPLE], values: [1, 2, 3, 4], reasons: [null, null, null, null] };
        const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const exit = main(['report.json'], {
            metrics: { [SAMPLE]: { renamedFrom: [] } },
            read: () => ({ ...REPORT, metrics: { [SAMPLE]: many } }),
        });
        expect(exit).toBe(0);
        expect(out).toHaveBeenCalledWith(`${SAMPLE} null=0.0% distinct=4 live\n`);
        out.mockRestore();
    });

    it('requires one report and accepts only --write', () => {
        expect(main([])).toBe(2);
        expect(main(['report.json', '--unknown'])).toBe(2);
    });
});
