import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { THRIVE_TOLERANCE, livingReadings, rateReading, upperReading } from '../../js/evo/role-budget-thrive-check.js';

describe('rateReading', () => {
    it('drifts when the formula is further from the scene than a share of the scene', () => {
        expect(rateReading('r', 'x', [100, 120], { relative: 0.3 }).drift).toBe(false);
        expect(rateReading('r', 'x', [60, 100], { relative: 0.3 }).drift).toBe(true);
        expect(rateReading('r', 'x', [60, 100], { relative: 0.3 }).tolerance).toBe('30%');
    });

    it('reads a fixed amount as an absolute difference, and a missing value as a drift unless both are missing', () => {
        expect(rateReading('r', 'x', [0.5, 0.65], { absolute: 0.2 }).drift).toBe(false);
        expect(rateReading('r', 'x', [0.5, 0.8], { absolute: 0.2 }).drift).toBe(true);
        expect(rateReading('r', 'x', [null, null], { relative: 0.1 }).drift).toBe(false);
        expect(rateReading('r', 'x', [1, null], { relative: 0.1 }).drift).toBe(true);
    });
});

describe('upperReading', () => {
    it('drifts only when the scene exceeds the formula by more than the amount: a bound is not a prediction', () => {
        expect(upperReading('r', 'x', [0.9, 0.5], 0.15).drift).toBe(false);
        expect(upperReading('r', 'x', [0.5, 0.6], 0.15).drift).toBe(false);
        expect(upperReading('r', 'x', [0.5, 0.7], 0.15).drift).toBe(true);
    });
});

describe('the readings', () => {
    it('the hunter living reads a kill or none for each prey beside the scene, and agrees at the defaults', () => {
        const readings = livingReadings(arenaConfig());
        expect(readings).toHaveLength(8);
        expect(readings.filter((r) => r.drift)).toEqual([]);
    });

    it('the tolerances put the sitter, which the formula reproduces to the tick, inside the walker', () => {
        expect(THRIVE_TOLERANCE.sitter).toBeLessThan(THRIVE_TOLERANCE.walker);
    });
});
