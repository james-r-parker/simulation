// The Phase 1 tuning keys of hunter-learning.md (T3): defaults and ranges, and the rules hash.

import { describe, expect, it } from 'vitest';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const DEFAULT_KEYS = {
    juvenileTicks: 3000,
    territoryRadius: 600,
    territoryMax: 1,
    satedBite: false,
    predatorRestTicks: 0,
    provisionEnabled: false,
    provisionShare: 0.3,
    provisionRange: 120,
};

/**
 * @param {Record<string, any>} overrides keys to set over SIMPLE_WORLD
 * @returns {Record<string, any>} the validated config
 */
const make = (overrides) => createConfig({ ...SIMPLE_WORLD, ...overrides });

describe('the hunter-learning Phase 1 keys', () => {
    it.each(Object.entries(DEFAULT_KEYS))('%s defaults to %s', (key, value) => {
        expect(DEFAULTS[key]).toBe(value);
        expect(make({})[key]).toBe(value);
    });

    it.each(['satedBite', 'provisionEnabled'])('%s is a boolean that accepts true', (key) => {
        expect(make({ [key]: true })[key]).toBe(true);
        expect(() => make({ [key]: 1 })).toThrow(new RegExp(key));
    });

    it.each([
        ['predatorRestTicks', 65535],
        ['provisionShare', 0],
        ['provisionShare', 1],
        ['provisionRange', 0.5],
        ['juvenileTicks', 1],
        ['territoryRadius', 0.5],
        ['territoryMax', 0],
        ['territoryMax', 5],
    ])('accepts %s at %s', (key, value) => {
        expect(make({ [key]: value })[key]).toBe(value);
    });

    it.each([
        ['provisionShare', -0.1],
        ['provisionShare', 1.1],
        ['provisionRange', 0],
        ['provisionRange', -5],
        ['predatorRestTicks', -1],
        ['predatorRestTicks', 65536],
        ['predatorRestTicks', 1.5],
        ['juvenileTicks', 0],
        ['juvenileTicks', 1.5],
        ['territoryRadius', 0],
        ['territoryRadius', -1],
        ['territoryMax', -1],
        ['territoryMax', 1.5],
    ])('rejects %s at %s, naming the key', (key, value) => {
        expect(() => make({ [key]: value })).toThrow(new RegExp(key));
    });

    it('changes the rules hash when a key changes', () => {
        expect(rulesHash(make({ territoryMax: 2 }))).not.toBe(rulesHash(make({})));
    });
});
