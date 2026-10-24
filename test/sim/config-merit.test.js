import { describe, expect, it } from 'vitest';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { FEATURE_RULES } from '../../js/sim/config-rules.js';
import { FEATURES_OFF, FEATURES_ON } from '../../scripts/lib/features-on.mjs';

// The merit keys of fitness-and-selection T16 (docs/designs/fitness-and-selection.md, "### Config").
const MERIT_DEFAULTS = {
    meritEnabled: false,
    meritChanceWeight: 0.25,
    meritMateBonus: 150,
    meritChildBonus: 300,
    meritEscapeBonus: 60,
    meritHalfLife: 20000,
    meritHalf: 1000,
    meritMateWeight: 0,
    meritBirthBoost: 0,
    splitDeliberateMin: 0,
    meritSplitFloorPop: 80,
};

/**
 * @param {Record<string, any>} overrides keys to set over FEATURES_OFF
 * @returns {Record<string, any>} the merged, validated config
 */
const off = (overrides) => createConfig({ ...FEATURES_OFF, ...overrides });

describe('merit keys: defaults', () => {
    it.each(Object.entries(MERIT_DEFAULTS))('%s defaults to %s in config-defaults', (key, value) => {
        expect(DEFAULTS[key]).toBe(value);
    });

    it('pins every merit key at its default in FEATURES_OFF and FEATURES_ON', () => {
        for (const [key, value] of Object.entries(MERIT_DEFAULTS)) {
            expect(FEATURES_OFF[key]).toBe(value);
            expect(FEATURES_ON[key]).toBe(value);
        }
    });

    it('reads the defaults back through createConfig with merit off', () => {
        const config = off({});
        for (const [key, value] of Object.entries(MERIT_DEFAULTS)) {
            expect(config[key]).toBe(value);
        }
        expect(config.meritEnabled).toBe(false);
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
            meritEnabled: true,
            meritChanceWeight: 0.5,
            meritMateBonus: 151,
            meritChildBonus: 301,
            meritEscapeBonus: 61,
            meritHalfLife: 20001,
            meritHalf: 1001,
            meritMateWeight: 0.5,
            meritBirthBoost: 0.1,
            splitDeliberateMin: 1,
            meritSplitFloorPop: 81,
        };
        for (const key of Object.keys(MERIT_DEFAULTS)) {
            expect(rulesHash(off({ [key]: moved[key] }))).not.toBe(rulesHash(base));
        }
    });
});

describe('merit keys: accepted at the edges, rejected just outside', () => {
    it.each([
        ['meritChanceWeight', 0, true],
        ['meritChanceWeight', 1, true],
        ['meritChanceWeight', -0.01, false],
        ['meritChanceWeight', 1.01, false],
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
        ['meritMateWeight', 0, true],
        ['meritMateWeight', 1, true],
        ['meritMateWeight', -0.01, false],
        ['meritMateWeight', 1.01, false],
        ['meritBirthBoost', 0, true],
        ['meritBirthBoost', 0.5, true],
        ['meritBirthBoost', -0.01, false],
        ['meritBirthBoost', 0.51, false],
        ['splitDeliberateMin', 0, true],
        ['splitDeliberateMin', -1, false],
        ['meritSplitFloorPop', 0, true],
        ['meritSplitFloorPop', 500, true],
        ['meritSplitFloorPop', -1, false],
    ])('%s = %s accepted: %s', (key, value, accepted) => {
        if (accepted) {
            expect(off({ [key]: value })[key]).toBe(value);
        } else {
            expect(() => off({ [key]: value })).toThrow(new RegExp(key));
        }
    });

    it('accepts meritSplitFloorPop above maxAgents, where the split gate stays open', () => {
        expect(off({ maxAgents: 120, meritSplitFloorPop: 121 }).meritSplitFloorPop).toBe(121);
        expect(off({ maxAgents: 120, meritSplitFloorPop: 500 }).meritSplitFloorPop).toBe(500);
    });
});

describe('merit keys: type checks', () => {
    it.each([
        ['meritEnabled', 1],
        ['meritEnabled', 'true'],
        ['meritChanceWeight', '0.25'],
        ['meritHalf', NaN],
    ])('rejects %s = %s', (key, value) => {
        expect(() => off({ [key]: value })).toThrow(new RegExp(key));
    });

    it.each([
        ['meritHalfLife', 1.5],
        ['meritSplitFloorPop', 80.5],
    ])('rejects the fraction %s = %s', (key, value) => {
        expect(() => off({ [key]: value })).toThrow(new RegExp(key));
    });
});
