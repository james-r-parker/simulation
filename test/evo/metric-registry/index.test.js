// The metric registry's index: the names it holds against the live report's names, and `metricName`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { METRICS, metricName } from '../../../js/evo/metric-registry/index.js';

/** @type {string[]} the 268 names of a live eval report, sorted */
const REPORT_NAMES = JSON.parse(readFileSync(new URL('../../fixtures/metric-names.json', import.meta.url), 'utf8'));

describe('METRICS', () => {
    it('is frozen and keyed by names that are in the live report', () => {
        expect(Object.isFrozen(METRICS)).toBe(true);
        for (const name of Object.keys(METRICS)) {
            expect(REPORT_NAMES, name).toContain(name);
        }
    });

    it('gives each entry the family and fields the registry requires', () => {
        for (const [name, e] of Object.entries(METRICS)) {
            expect(e.meaning.length, name).toBeGreaterThan(0);
            expect(e.counts.length, name).toBeGreaterThan(0);
            expect(['higher', 'lower', 'watch'], name).toContain(e.direction);
            expect(e.direction === 'watch' ? ['higher', 'lower'] : [undefined], name).toContain(e.intended);
        }
    });
});

describe('metricName', () => {
    it('joins a registered base and suffix', () => {
        expect(metricName('eval', 'median_lifespan')).toBe('eval.median_lifespan');
    });

    it('throws on a name with no entry', () => {
        expect(() => metricName('eval', 'nothing')).toThrow('unknown metric eval.nothing');
    });
});
