import { describe, expect, it } from 'vitest';
import { createConfig, configHash, rulesHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';

/** @param {any} value */
function isDeepFrozen(value) {
    if (value === null || typeof value !== 'object') {
        return true;
    }
    return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('createConfig', () => {
    it('returns the defaults when given no overrides', () => {
        expect(createConfig()).toEqual(DEFAULTS);
    });

    it('applies a top-level override', () => {
        expect(createConfig({ seed: 7 }).seed).toBe(7);
    });

    it('deep-merges a nested object key by key', () => {
        const config = createConfig({ specialisations: { scout: { visionRange: 500 } } });
        expect(config.specialisations.scout.visionRange).toBe(500);
        expect(config.specialisations.scout.moveCostMultiplier).toBe(0.7);
    });

    it('replaces an array whole instead of merging it', () => {
        const season = { foodScarcity: 1, energyDrain: 1, reproductionBonus: 1 };
        const config = createConfig({ seasons: [season, season, season, season] });
        expect(config.seasons[3]).toEqual(season);
        expect(() => createConfig({ seasons: [season] })).toThrow(/seasons/);
    });

    it('returns a deeply frozen config', () => {
        expect(isDeepFrozen(createConfig())).toBe(true);
    });

    it('does not mutate DEFAULTS or the overrides', () => {
        const overrides = { specialisations: { scout: { visionRange: 500 } } };
        createConfig(overrides);
        expect(DEFAULTS.specialisations.scout.visionRange).toBe(400);
        expect(Object.isFrozen(overrides)).toBe(false);
    });
});

describe('configHash', () => {
    it('is 16 hex characters', () => {
        expect(configHash(createConfig())).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is stable across key order', () => {
        const config = createConfig();
        const reversed = Object.fromEntries(Object.entries(config).reverse());
        expect(configHash(reversed)).toBe(configHash(config));
    });

    it('differs when a value changes', () => {
        expect(configHash(createConfig({ seed: 2 }))).not.toBe(configHash(createConfig()));
    });

    it('differs when a nested value changes', () => {
        const changed = createConfig({
            seasons: DEFAULTS.seasons.map((/** @type {any} */ s, /** @type {number} */ i) =>
                i === 0 ? { ...s, energyDrain: 2 } : s,
            ),
        });
        expect(configHash(changed)).not.toBe(configHash(createConfig()));
    });
});

describe('rulesHash', () => {
    it('ignores seed, population and checking keys', () => {
        const changed = createConfig({
            seed: 9,
            maxAgents: 400,
            initialAgents: 50,
            minAgents: 5,
            immigrationInterval: 0,
            checkInvariants: true,
        });
        expect(rulesHash(changed)).toBe(rulesHash(createConfig()));
    });

    it('differs when a physics key changes', () => {
        expect(rulesHash(createConfig({ maxVelocity: 9 }))).not.toBe(rulesHash(createConfig()));
    });
});
