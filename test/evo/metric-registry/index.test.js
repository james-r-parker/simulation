// The metric registry's index: the names it holds against the live report's names, and `metricName`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { METRICS, metricName } from '../../../js/evo/metric-registry/index.js';

/** @type {string[]} the 268 names of a live eval report, sorted */
const REPORT_NAMES = JSON.parse(readFileSync(new URL('../../fixtures/metric-names.json', import.meta.url), 'utf8'));

describe('METRICS', () => {
    it('is frozen and keyed by exactly the names of the live report', () => {
        expect(Object.isFrozen(METRICS)).toBe(true);
        expect(REPORT_NAMES).toHaveLength(268);
        expect(Object.keys(METRICS).sort()).toEqual(REPORT_NAMES);
    });

    it('puts every metric in one of the seven families', () => {
        const families = new Set(Object.values(METRICS).map((e) => e.family));
        expect([...families].sort()).toEqual([
            'brain',
            'core',
            'hunters',
            'intent',
            'scenes-ecology',
            'scenes-social',
            'world',
        ]);
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
