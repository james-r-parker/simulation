import { describe, expect, it } from 'vitest';
import { barOf, baselineShares, judge, parseGate, POPULATIONS_NEEDED } from '../../js/evo/feasible.js';

describe('parseGate', () => {
    it('groups the checkable conditions by drill and lists the rest once, unchecked', () => {
        const { needs, unchecked } = parseGate([
            { read: 'drill.prey-ahead.winShareOverReference', min: 0.5 },
            { read: 'drill.prey-ahead.winShareLow', min: 0.001 },
            { read: 'drill.kin-spared.edgeLow', min: 0.01 },
            { read: 'retention.all', min: 1 },
            { read: 'retention.all', min: 1 },
            { read: 'crossplay.cycleShare', max: 0.25 },
            { read: 'drill.prey-ahead.jawShareLow', min: 0.1 },
            { read: 'drill.prey-ahead.edgeLow', max: 0.9 },
        ]);
        expect([...needs.keys()]).toEqual(['prey-ahead', 'kin-spared']);
        expect(needs.get('prey-ahead')).toEqual([
            { kind: 'winShareOverReference', bound: 0.5 },
            { kind: 'winShareLow', bound: 0.001 },
        ]);
        expect(unchecked).toEqual([
            'retention.all',
            'crossplay.cycleShare',
            'drill.prey-ahead.jawShareLow',
            'drill.prey-ahead.edgeLow',
        ]);
    });

    it('refuses a drill that does not exist', () => {
        expect(() => parseGate([{ read: 'drill.no-such.edgeLow', min: 0.1 }])).toThrow(/unknown drill/);
    });
});

describe('barOf', () => {
    const shares = { reference: 0.8, random: 0.1 };

    it('reads each kind: the bound itself, the reference times the bound, the random share plus the bound', () => {
        expect(barOf([{ kind: 'winShareLow', bound: 0.3 }], shares)).toBe(0.3);
        expect(barOf([{ kind: 'winShareOverReference', bound: 0.5 }], shares)).toBeCloseTo(0.4, 12);
        expect(barOf([{ kind: 'edgeLow', bound: 0.3 }], shares)).toBeCloseTo(0.4, 12);
    });

    it('takes the largest bar when a drill has several conditions', () => {
        const bar = barOf(
            [
                { kind: 'winShareLow', bound: 0.001 },
                { kind: 'winShareOverReference', bound: 0.5 },
            ],
            shares,
        );
        expect(bar).toBeCloseTo(0.4, 12);
    });
});

describe('judge', () => {
    it('is learnable when at least the needed populations reach the bar, the bar itself counting', () => {
        expect(judge([0.2, 0.5, 0.5, 0.1], 0.5)).toEqual({ reached: 2, best: 0.5, learnable: true });
        expect(POPULATIONS_NEEDED).toBe(2);
    });

    it('is not learnable with one population at the bar', () => {
        expect(judge([0.2, 0.9, 0.49], 0.5)).toEqual({ reached: 1, best: 0.9, learnable: false });
    });
});

describe('baselineShares', () => {
    it('reads the memoryless reference and the mean of the random brains on the drill', () => {
        const shares = baselineShares('food-ahead', { config: {}, trials: 4 });
        expect(shares.reference).toBeGreaterThan(0.5);
        expect(shares.random).toBeGreaterThanOrEqual(0);
        expect(shares.random).toBeLessThan(shares.reference);
    });
});
