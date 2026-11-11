// metricStatus and the liveness and power bars of the metric registry (docs/designs/metric-trust.md).

import { describe, expect, it } from 'vitest';
import { entry } from '../../../js/evo/metric-registry/entry.js';
import {
    meetsLivenessBar,
    meetsPowerBar,
    metricStatus,
    minSeedsFromPower,
} from '../../../js/evo/metric-registry/status.js';

const BASE = {
    module: 'js/evo/metrics.js',
    meaning: 'm',
    counts: 'c',
    unit: 'ticks',
    direction: /** @type {const} */ ('higher'),
    nullWhen: [],
};

/** @param {number} fpr @param {number} mde @param {number} [referenceMean] @returns {import('../../../js/evo/metric-registry/entry.js').Power} a power read, same at both seed counts */
const power = (fpr, mde, referenceMean = 100) => ({
    fpr16: fpr,
    fpr32: fpr,
    mde16: mde,
    mde32: mde,
    referenceMean,
    report: 'r.json',
});

const LIVE = { nullShare: 0.1, distinct: 2, report: 'r.json' };

/** @returns {import('../../../js/evo/metric-registry/entry.js').MetricEntry} an entry with every check filled */
function full() {
    return {
        ...entry('core', BASE),
        tests: { arithmetic: 'a.test.js', source: 's.test.js' },
        liveness: LIVE,
        power: power(0.05, 0.1),
        minSeeds: 16,
    };
}

describe('metricStatus', () => {
    it('is unverified for a fresh entry', () => {
        expect(metricStatus(entry('core', BASE))).toBe('unverified');
    });

    it('is verified when every check is filled', () => {
        expect(metricStatus(full())).toBe('verified');
    });

    it('is deprecated when deprecated is set, whatever else is filled', () => {
        expect(metricStatus({ ...full(), deprecated: 'no plantable answer' })).toBe('deprecated');
    });

    it.each([
        ['arithmetic test', { tests: { arithmetic: '', source: 's.test.js' } }],
        ['source test', { tests: { arithmetic: 'a.test.js', source: '' } }],
        ['liveness', { liveness: null }],
        ['power', { power: null }],
        ['minSeeds', { minSeeds: null }],
    ])('is unverified without the %s', (_name, patch) => {
        expect(metricStatus({ ...full(), ...patch })).toBe('unverified');
    });

    it('accepts a liveness that misses the bar when expectedFlat says why', () => {
        const flat = { ...full(), liveness: { nullShare: 1, distinct: 0, report: 'r.json' } };
        expect(metricStatus(flat)).toBe('unverified');
        expect(metricStatus({ ...flat, expectedFlat: 'needs the herd feature' })).toBe('verified');
    });
});

describe('meetsLivenessBar', () => {
    it('holds at null on 10% of seeds and 2 distinct values', () => {
        expect(meetsLivenessBar({ nullShare: 0.1, distinct: 2, report: 'r' })).toBe(true);
    });

    it('fails above 10% null or below 2 values', () => {
        expect(meetsLivenessBar({ nullShare: 0.11, distinct: 2, report: 'r' })).toBe(false);
        expect(meetsLivenessBar({ nullShare: 0, distinct: 1, report: 'r' })).toBe(false);
    });
});

describe('meetsPowerBar', () => {
    /**
     * @param {string} unit the unit
     * @param {import('../../../js/evo/metric-registry/entry.js').Power} p the power read
     * @param {16 | 32} [seeds] the seed count
     * @returns {boolean} whether the bar holds
     */
    const at = (unit, p, seeds = 16) => meetsPowerBar({ unit, power: p }, seeds);

    it('holds a relative metric at fpr 0.10 and a change of 0.20 of the mean, and fails just past either', () => {
        expect(at('ticks', power(0.1, 0.2))).toBe(true);
        expect(at('ticks', power(0.101, 0.2))).toBe(false);
        expect(at('ticks', power(0.1, 0.21))).toBe(false);
    });

    it('compares the detectable change of a share with an absolute 0.05, whatever the mean', () => {
        expect(at('share', power(0.05, 0.05, 0.1))).toBe(true);
        expect(at('share', power(0.05, 0.05, 0.9))).toBe(true);
        expect(at('share', power(0.05, 0.075, 0.9))).toBe(false);
        expect(at('share', power(0.05, 0.05, 0.1), 32)).toBe(true);
        expect(at('share', power(0.05, 0.1, 0.1))).toBe(false);
    });

    it('uses an absolute 0.10 for a correlation or a trend', () => {
        expect(at('correlation', power(0.05, 0.5, 0.2))).toBe(true);
        expect(at('trend', power(0.05, 0.6, 0.2))).toBe(false);
    });

    it('uses the absolute 0.10 when the reference mean is within 0.01 of 0', () => {
        expect(at('count', power(0.05, 5, 0.01))).toBe(true);
        expect(at('count', power(0.05, 5, 0.02))).toBe(false);
    });

    it('fails when the change or the rate was not measured', () => {
        expect(at('ticks', { ...power(0.05, 0.1), mde16: null })).toBe(false);
        expect(at('ticks', { ...power(0.05, 0.1), fpr16: null })).toBe(false);
    });

    it('reads the 32-seed pair for 32 seeds', () => {
        const p = { ...power(0.05, 0.1), fpr32: 0.5 };
        expect(at('ticks', p, 16)).toBe(true);
        expect(at('ticks', p, 32)).toBe(false);
    });
});

describe('minSeedsFromPower', () => {
    it('gives 16 when 16 seeds meet the bar, 32 when only 32 do, null otherwise', () => {
        expect(minSeedsFromPower({ unit: 'ticks', power: power(0.05, 0.1) })).toBe(16);
        const late = { ...power(0.05, 0.1), mde16: 0.5 };
        expect(minSeedsFromPower({ unit: 'ticks', power: late })).toBe(32);
        expect(minSeedsFromPower({ unit: 'ticks', power: { ...late, mde32: 0.5 } })).toBe(null);
    });
});
