// The per-metric liveness read and generated registry data (docs/designs/metric-trust.md, T23, T25).

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

    it('requires one report and accepts only --write', () => {
        expect(main([])).toBe(2);
        expect(main(['report.json', '--unknown'])).toBe(2);
    });
});
