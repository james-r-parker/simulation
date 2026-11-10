// An old report reads through the registry's `renamedFrom` names (docs/designs/metric-trust.md, T25).

import { describe, expect, it } from 'vitest';
import { buildRenames, currentName, withCurrentNames } from '../../../js/evo/metric-registry/renames.js';

const METRICS = {
    'x.alpha_p50': { renamedFrom: ['x.alpha'] },
    'x.beta': { renamedFrom: [] },
};

describe('buildRenames', () => {
    it('maps every old name to its current name', () => {
        expect(buildRenames(METRICS)).toEqual(new Map([['x.alpha', 'x.alpha_p50']]));
    });

    it('refuses an old name that is also a current name, or one claimed twice', () => {
        expect(() => buildRenames({ ...METRICS, 'x.alpha': { renamedFrom: [] } })).toThrow(
            'x.alpha is both a current name and an old name',
        );
        expect(() => buildRenames({ ...METRICS, 'x.gamma': { renamedFrom: ['x.alpha'] } })).toThrow(
            'x.alpha is an old name of x.alpha_p50 and x.gamma',
        );
    });
});

describe('currentName', () => {
    it('gives the current name for an old one and leaves any other name alone', () => {
        expect(currentName('x.alpha', METRICS)).toBe('x.alpha_p50');
        expect(currentName('x.beta', METRICS)).toBe('x.beta');
        expect(currentName('bench.step_ms@500', METRICS)).toBe('bench.step_ms@500');
    });
});

describe('withCurrentNames', () => {
    it('renames the metrics of an old report without touching the original', () => {
        const report = { seeds: [1], metrics: { 'x.alpha': { values: [2] }, 'x.beta': { values: [3] } } };
        const renamed = withCurrentNames(report, METRICS);
        expect(Object.keys(renamed.metrics)).toEqual(['x.alpha_p50', 'x.beta']);
        expect(renamed.metrics['x.alpha_p50']).toBe(report.metrics['x.alpha']);
        expect(renamed.seeds).toBe(report.seeds);
        expect(Object.keys(report.metrics)).toEqual(['x.alpha', 'x.beta']);
    });

    it('returns a report with current names unchanged', () => {
        const report = { metrics: { 'x.alpha_p50': { values: [2] } } };
        expect(withCurrentNames(report, METRICS)).toBe(report);
    });

    it('refuses a report that holds a metric under both its old and current names', () => {
        const report = { metrics: { 'x.alpha': { values: [1] }, 'x.alpha_p50': { values: [2] } } };
        expect(() => withCurrentNames(report, METRICS)).toThrow('report holds x.alpha_p50 under two names');
    });
});

describe('the registry', () => {
    it('has no ambiguous rename', () => {
        expect(() => withCurrentNames({ metrics: {} })).not.toThrow();
        expect(currentName('eval.catch_rate')).toBe('eval.hunter_catches_per_1k');
    });
});
