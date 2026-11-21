import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { createConfig } from '../../js/sim/config.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import {
    THRIVE_TOLERANCE,
    firstMealReadings,
    foragingReadings,
    idleReadings,
    livingReadings,
    rateReading,
    thriveCheck,
    upperReading,
} from '../../js/evo/role-budget-thrive-check.js';

/** A small world and a short life, so each scene finishes in a fraction of a second. */
const SMALL = createConfig({
    worldWidth: 4000,
    worldHeight: 3000,
    maxFood: 300,
    foodPatchCount: 2,
    foodPatchRadius: 300,
    maxAgeTicks: 300,
    maturityTicks: 50,
    initialFood: 300,
});

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
    it('reads the net energy of a chase where the hunter kills (the courser arm), beside the Phase 1 formula', () => {
        const readings = livingReadings(arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'))));
        expect(readings.some((r) => r.what.endsWith('net energy of the chase') && typeof r.scene === 'number')).toBe(
            true,
        );
    });

    it('the hunter living reads a kill or none for each prey beside the scene, and agrees at the defaults', () => {
        const readings = livingReadings(arenaConfig());
        expect(readings).toHaveLength(8);
        expect(readings.filter((r) => r.drift)).toEqual([]);
    });

    it('the tolerances put the sitter, which the formula reproduces to the tick, inside the walker', () => {
        expect(THRIVE_TOLERANCE.sitter).toBeLessThan(THRIVE_TOLERANCE.walker);
    });
});

describe('the readings of a small world', () => {
    it('reads the sitter and the walker from each birth energy: six readings, each a formula beside a scene', () => {
        const readings = idleReadings(SMALL, MODEL_DEFAULTS);
        expect(readings.map((r) => r.what)).toEqual([
            'founder sits',
            'founder searches',
            'entrant sits',
            'entrant searches',
            'child sits',
            'child searches',
        ]);
        expect(readings.every((r) => r.row === 'forager:idle' && typeof r.scene === 'number')).toBe(true);
    });

    it('reads the forager in a grid beside its cycle', () => {
        const [rate] = foragingReadings(SMALL, MODEL_DEFAULTS);
        expect(rate.row).toBe('forager:predator');
        expect(rate.formula).toBeGreaterThan(0);
        expect(rate.scene).toBeGreaterThan(0);
    });

    it('reads the reach and find shares of each birth rule over a few seeded bodies', () => {
        const readings = firstMealReadings(SMALL, MODEL_DEFAULTS, { count: 4 });
        expect(readings).toHaveLength(6);
        expect(readings.map((r) => r.what.split(':')[0])).toEqual([
            'founder',
            'founder',
            'entrant',
            'entrant',
            'child',
            'child',
        ]);
        expect(readings.map((r) => Number(r.scene)).every((v) => v >= 0 && v <= 1)).toBe(true);
    });

    it('puts every reading together and counts the drift', () => {
        const check = thriveCheck(arenaConfig(), SMALL, MODEL_DEFAULTS, { count: 4 });
        expect(check.readings).toHaveLength(6 + 1 + 8 + 6);
        expect(check.drift).toBe(check.readings.filter((r) => r.drift).length);
    });
});
