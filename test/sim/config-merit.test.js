import { describe, expect, it } from 'vitest';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { FEATURE_RULES } from '../../js/sim/config-rules.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

// The merit keys of fitness-and-selection T16 (docs/designs/fitness-and-selection.md, "### Config") at their values
// before the E41 finalist.
const MERIT_OFF = {
    meritMateBonus: 150,
    meritChildBonus: 300,
    meritEscapeBonus: 60,
    meritHalfLife: 20000,
    meritHalf: 1000,
    mateRank: 'rank',
    meritBirthBoost: 0,
    splitDeliberateMin: 0,
};
// The defaults from T48b: the E41 finalist split-300 (merit on, the split gate at 300), every other key unchanged.
const MERIT_DEFAULTS = { ...MERIT_OFF, splitDeliberateMin: 300 };

/**
 * @param {Record<string, any>} overrides keys to set over SIMPLE_WORLD
 * @returns {Record<string, any>} the merged, validated config
 */
const off = (overrides) => createConfig({ ...SIMPLE_WORLD, ...overrides });

describe('merit keys: defaults', () => {
    it.each(Object.entries(MERIT_DEFAULTS))('%s defaults to %s in config-defaults', (key, value) => {
        expect(DEFAULTS[key]).toBe(value);
    });

    it('leaves every merit key but the split gate at its default in SIMPLE_WORLD', () => {
        for (const [key, value] of Object.entries(MERIT_OFF)) {
            expect(SIMPLE_WORLD[key] ?? value).toBe(value);
        }
    });

    it('reads the defaults back through createConfig, with the split gate at 300', () => {
        const config = createConfig({});
        for (const [key, value] of Object.entries(MERIT_DEFAULTS)) {
            expect(config[key]).toBe(value);
        }
    });

    it('has a FEATURE_RULES entry for every merit key', () => {
        for (const key of Object.keys(MERIT_DEFAULTS)) {
            expect(FEATURE_RULES).toHaveProperty(key);
        }
    });

    it('covers the merit keys in rulesHash, so changing one changes the hash', () => {
        const base = off({});
        /** @type {Record<string, any>} */
        const moved = {
            meritMateBonus: 151,
            meritChildBonus: 301,
            meritEscapeBonus: 61,
            meritHalfLife: 20001,
            meritHalf: 1001,
            mateRank: 'offspring',
            meritBirthBoost: 0.1,
            splitDeliberateMin: 1,
        };
        for (const key of Object.keys(MERIT_DEFAULTS)) {
            expect(rulesHash(off({ [key]: moved[key] }))).not.toBe(rulesHash(base));
        }
    });
});

describe('merit keys: accepted at the edges, rejected just outside', () => {
    it.each([
        ['meritMateBonus', 0, true],
        ['meritMateBonus', -1, false],
        ['meritChildBonus', 0, true],
        ['meritChildBonus', -1, false],
        ['meritEscapeBonus', 0, true],
        ['meritEscapeBonus', -1, false],
        ['meritHalfLife', 0, true],
        ['meritHalfLife', -1, false],
        ['meritHalf', 0.001, true],
        ['meritHalf', 0, false],
        ['mateRank', 'rank', true],
        ['mateRank', 'offspring', true],
        ['mateRank', 'energy', false],
        ['mateRank', 0.5, false],
        ['meritBirthBoost', 0, true],
        ['meritBirthBoost', 0.5, true],
        ['meritBirthBoost', -0.01, false],
        ['meritBirthBoost', 0.51, false],
        ['splitDeliberateMin', 0, true],
        ['splitDeliberateMin', -1, false],
    ])('%s = %s accepted: %s', (key, value, accepted) => {
        if (accepted) {
            expect(off({ [key]: value })[key]).toBe(value);
        } else {
            expect(() => off({ [key]: value })).toThrow(new RegExp(key));
        }
    });
});

describe('merit keys: type checks', () => {
    it.each([['meritHalf', NaN]])('rejects %s = %s', (key, value) => {
        expect(() => off({ [key]: value })).toThrow(new RegExp(key));
    });

    it.each([['meritHalfLife', 1.5]])('rejects the fraction %s = %s', (key, value) => {
        expect(() => off({ [key]: value })).toThrow(new RegExp(key));
    });
});
