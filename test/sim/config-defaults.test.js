import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { validateConfig } from '../../js/sim/config-validate.js';

describe('DEFAULTS', () => {
    it('passes validation', () => {
        expect(() => validateConfig(DEFAULTS)).not.toThrow();
    });

    it('sets the birth keys', () => {
        expect([DEFAULTS.mateRange, DEFAULTS.childEnergyShare, DEFAULTS.childEnergyMin]).toEqual([100, 0.4, 200]);
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
});
