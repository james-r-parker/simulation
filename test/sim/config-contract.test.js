import { describe, expect, it } from 'vitest';
import { createConfig, configHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { validateConfig } from '../../js/sim/config-validate.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const SPEC_FIELDS =
    'index, visionRange, canHunt, moveCostMultiplier, biteTakenMultiplier, cooldownMultiplier, biteMultiplier, turnMultiplier, plantFoodValue, meatFoodValue, sprintBoost, passiveLossMultiplier, splitMinEnergyMultiplier';

/**
 * Reference FNV-1a 64-bit over the characters of an ASCII string.
 * @param {string} text ASCII text
 * @returns {string} 16 hex characters
 */
function referenceFnv64(text) {
    let hash = 0xcbf29ce484222325n;
    for (const char of text) {
        hash = ((hash ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return hash.toString(16).padStart(16, '0');
}

describe('DEFAULTS tables', () => {
    it('leaves invariant checking off', () => {
        expect(DEFAULTS.checkInvariants).toBe(false);
    });

    it('holds the design doc season table', () => {
        expect(DEFAULTS.seasons).toEqual([
            { foodScarcity: 1.2, energyDrain: 1.0, reproductionBonus: 1.5, temperatureModifier: -5 },
            { foodScarcity: 1.0, energyDrain: 1.3, reproductionBonus: 1.2, temperatureModifier: 15 },
            { foodScarcity: 0.8, energyDrain: 1.1, reproductionBonus: 0.7, temperatureModifier: 5 },
            { foodScarcity: 0.4, energyDrain: 1.8, reproductionBonus: 0.3, temperatureModifier: -15 },
        ]);
    });

    it('holds the design doc specialisation table', () => {
        const rows = Object.entries(DEFAULTS.specialisations).map(([name, s]) => [
            name,
            s.index,
            s.visionRange,
            s.canHunt,
            s.moveCostMultiplier,
            s.biteTakenMultiplier,
            s.cooldownMultiplier,
        ]);
        expect(rows).toEqual([
            ['forager', 0, 300, false, 1, 1, 1],
            ['predator', 1, 350, true, 1, 1, 1],
            ['reproducer', 2, 250, false, 1, 1, 0.5],
            ['scout', 3, 400, false, 0.7, 1, 1],
            ['defender', 4, 350, false, 1, 0.5, 1],
        ]);
    });
});

describe('createConfig isolation', () => {
    it('copies the default seasons instead of sharing them', () => {
        const config = createConfig({ ...FEATURES_OFF });
        expect(config.seasons).not.toBe(DEFAULTS.seasons);
        expect(config.seasons[0]).not.toBe(DEFAULTS.seasons[0]);
    });

    it('copies an override array instead of freezing the caller own array', () => {
        const season = { foodScarcity: 1, energyDrain: 1, reproductionBonus: 1, temperatureModifier: 0 };
        const seasons = [season, season, season, season];
        const config = createConfig({ ...FEATURES_OFF, seasons });
        expect(config.seasons).not.toBe(seasons);
        expect(Object.isFrozen(seasons)).toBe(false);
        expect(Array.isArray(config.seasons)).toBe(true);
    });

    it('reports a null override as a validation error, not a crash', () => {
        expect(() => createConfig({ ...FEATURES_OFF, specialisations: null })).toThrow(
            'config.specialisations is null; expected an object',
        );
    });
});

describe('configHash text', () => {
    it('hashes the canonical JSON with sorted keys and comma separators', () => {
        const value = { b: { d: 4, c: 3 }, a: [1, 2], e: [] };
        expect(configHash(value)).toBe(referenceFnv64('{"a":[1,2],"b":{"c":3,"d":4},"e":[]}'));
    });
});

describe('configHash arrays', () => {
    it('sorts the keys of objects inside arrays', () => {
        expect(configHash({ a: [{ b: 1, a: 2 }] })).toBe(referenceFnv64('{"a":[{"a":2,"b":1}]}'));
    });
});

describe('validateConfig error text', () => {
    /**
     * @param {() => void} fn the call
     * @returns {string} the thrown message
     */
    function message(fn) {
        try {
            fn();
        } catch (error) {
            return /** @type {Error} */ (error).message;
        }
        return '';
    }

    it('names a non-object config with an empty path', () => {
        expect(message(() => validateConfig(/** @type {any} */ (null)))).toBe('config is null; expected an object');
    });

    it('describes a bounded integer rule', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, seed: -1 }))).toBe(
            'config.seed is -1; expected an integer >= 0 and <= 4294967295',
        );
    });

    it('describes an unbounded integer rule without an upper bound', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, initialAgents: -1 }))).toBe(
            'config.initialAgents is -1; expected an integer >= 0',
        );
    });

    it('describes an exclusive lower bound', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, foodEnergy: 0 }))).toBe(
            'config.foodEnergy is 0; expected a finite number > 0',
        );
    });

    it('describes an unbounded number rule without an upper bound', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, foodSpawnRate: -1 }))).toBe(
            'config.foodSpawnRate is -1; expected a finite number >= 0',
        );
    });

    it('describes a bounded number rule', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, damping: 2 }))).toBe(
            'config.damping is 2; expected a finite number >= 0 and <= 1',
        );
    });

    it('lists the known keys for an unknown top-level key', () => {
        const text = message(() => createConfig({ ...FEATURES_OFF, bogus: 1 }));
        expect(text.startsWith('config.bogus is 1; expected no such key (known: seed, worldWidth, worldHeight,')).toBe(
            true,
        );
    });

    it('lists the known fields for an unknown specialisation field', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, specialisations: { scout: { speed: 1 } } }))).toBe(
            `config.specialisations.scout.speed is 1; expected no such key (known: ${SPEC_FIELDS})`,
        );
    });

    it('names a missing top-level key', () => {
        const config = /** @type {Record<string, any>} */ (structuredClone(DEFAULTS));
        delete config.seed;
        expect(message(() => validateConfig(config))).toBe('config.seed is undefined; expected a value (missing key)');
    });

    it('names a missing season key by its full path', () => {
        const config = /** @type {Record<string, any>} */ (structuredClone(DEFAULTS));
        delete config.seasons[1].energyDrain;
        expect(message(() => validateConfig(config))).toBe(
            'config.seasons[1].energyDrain is undefined; expected a value (missing key)',
        );
    });

    it('names a missing specialisation field by its full path', () => {
        const config = /** @type {Record<string, any>} */ (structuredClone(DEFAULTS));
        delete config.specialisations.scout.canHunt;
        expect(message(() => validateConfig(config))).toBe(
            'config.specialisations.scout.canHunt is undefined; expected a value (missing key)',
        );
    });

    it('states the weight storage limit and the product', () => {
        const wc = 128 * (64 * 9 + 35 + 128 + 1 + 11) + 11 + 4 + 128;
        expect(message(() => createConfig({ ...FEATURES_OFF, maxAgents: 4096, rayCount: 64, brainHidden: 128 }))).toBe(
            `config.maxAgents is 4096; expected at most 16777216 / weightCount (maxAgents x weightCount is ${4096 * wc})`,
        );
    });

    it('accepts weight storage just under the limit', () => {
        expect(() => createConfig({ ...FEATURES_OFF, maxAgents: 174, rayCount: 64, brainHidden: 128 })).not.toThrow();
        expect(() => createConfig({ ...FEATURES_OFF, maxAgents: 175, rayCount: 64, brainHidden: 128 })).toThrow(
            /maxAgents/,
        );
    });

    it('states the event capacity and the product', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, maxAgents: 500, eventCapacity: 2999 }))).toBe(
            'eventCapacity: 2999 is below 6 x maxAgents (3000)',
        );
    });

    it('accepts an event capacity of exactly 6 x maxAgents', () => {
        expect(() => createConfig({ ...FEATURES_OFF, maxAgents: 500, eventCapacity: 3000 })).not.toThrow();
    });

    it('checks the weight storage before the event capacity', () => {
        expect(() =>
            createConfig({ ...FEATURES_OFF, maxAgents: 4096, rayCount: 64, brainHidden: 128, eventCapacity: 1 }),
        ).toThrow(/maxAgents.*weightCount/);
    });

    it('states the largest radius when the hash cell is too small', () => {
        expect(message(() => createConfig({ ...FEATURES_OFF, hashCellSize: 125 }))).toBe(
            'config.hashCellSize is 125; expected > the largest radius (125)',
        );
    });
});
