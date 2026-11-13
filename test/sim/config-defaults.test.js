import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { validateConfig } from '../../js/sim/config-validate.js';

describe('DEFAULTS', () => {
    it('passes validation', () => {
        expect(() => validateConfig(DEFAULTS)).not.toThrow();
    });

    it('sets the birth keys', () => {
        expect([DEFAULTS.mateRange, DEFAULTS.childEnergyShare, DEFAULTS.childEnergyMin]).toEqual([200, 0.5, 100]);
    });

    it('uses the measured Flora toxin dose and retains the patch-pool capacity', () => {
        expect(DEFAULTS.toxinDose).toBe(1.2);
        expect(DEFAULTS.floraPatchMax).toBe(32);
    });

    it('is frozen at every level', () => {
        expect(Object.isFrozen(DEFAULTS)).toBe(true);
        expect(Object.isFrozen(DEFAULTS.seasons)).toBe(true);
        expect(Object.isFrozen(DEFAULTS.seasons[0])).toBe(true);
        expect(Object.isFrozen(DEFAULTS.specialisations.scout)).toBe(true);
    });

    it('has four seasons in spring, summer, autumn, winter order', () => {
        expect(DEFAULTS.seasons.map((/** @type {any} */ s) => s.foodScarcity)).toEqual([1.2, 1.0, 0.8, 0.4]);
    });

    it('numbers the specialisations 0 to 4 in key order', () => {
        const indexes = Object.values(DEFAULTS.specialisations).map((s) => s.index);
        expect(Object.keys(DEFAULTS.specialisations)).toEqual([
            'forager',
            'predator',
            'reproducer',
            'scout',
            'defender',
        ]);
        expect(indexes).toEqual([0, 1, 2, 3, 4]);
    });

    it('lets only the predator hunt', () => {
        const hunters = Object.entries(DEFAULTS.specialisations).filter(([, s]) => s.canHunt);
        expect(hunters.map(([name]) => name)).toEqual(['predator']);
    });

    it('holds the seventeen temperature keys and the season modifiers', () => {
        const keys = Object.keys(DEFAULTS).filter((key) => key.startsWith('temperature'));
        expect(keys).toHaveLength(17);
        expect(DEFAULTS.temperatureMax).toBe(100);
        expect(DEFAULTS.temperatureStart).toBe(50);
        expect([DEFAULTS.temperatureGainMove, DEFAULTS.temperatureGainEat, DEFAULTS.temperatureLossPassive]).toEqual([
            0.01, 1.5, 0.0075,
        ]);
        expect([DEFAULTS.temperatureSeasonSlope, DEFAULTS.temperaturePassiveLossFactor]).toEqual([0.03, 2]);
        expect([
            DEFAULTS.temperatureColdStress,
            DEFAULTS.temperatureColdModerate,
            DEFAULTS.temperatureOptimalMin,
            DEFAULTS.temperatureOptimalMax,
            DEFAULTS.temperatureHeatModerate,
            DEFAULTS.temperatureHeatStress,
        ]).toEqual([30, 40, 40, 65, 70, 85]);
        expect([
            DEFAULTS.temperatureEfficiencyColdSevere,
            DEFAULTS.temperatureEfficiencyColdModerate,
            DEFAULTS.temperatureEfficiencyHeatModerate,
            DEFAULTS.temperatureEfficiencyHeatSevere,
        ]).toEqual([0.3, 0.7, 0.9, 0.6]);
        expect(DEFAULTS.seasons.map((/** @type {any} */ s) => s.temperatureModifier)).toEqual([-5, 15, 5, -15]);
    });
});
