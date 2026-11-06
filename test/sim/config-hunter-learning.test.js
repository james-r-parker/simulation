// The Phase 1 keys of hunter-learning.md (T3): defaults, ranges and the rules hash. Every switch is off, so no world moves.

import { describe, expect, it } from 'vitest';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const DEFAULT_KEYS = {
    juvenileTicks: 3000,
    juvenileDependency: false,
    juvenileBurn: 0.6,
    kinPullWeight: 0.5,
    flipReflex: false,
    satedBite: false,
    hunterTerritory: false,
    territoryRadius: 600,
    territoryMax: 1,
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

    it.each(['juvenileDependency', 'flipReflex', 'satedBite', 'hunterTerritory'])(
        '%s is a boolean that accepts true',
        (key) => {
            expect(make({ [key]: true })[key]).toBe(true);
            expect(() => make({ [key]: 1 })).toThrow(new RegExp(key));
        },
    );

    it.each([
        ['juvenileTicks', 1],
        ['juvenileBurn', 0],
        ['juvenileBurn', 1],
        ['kinPullWeight', 0],
        ['kinPullWeight', 4],
        ['territoryRadius', 0.5],
        ['territoryMax', 0],
        ['territoryMax', 5],
    ])('accepts %s at %s', (key, value) => {
        expect(make({ [key]: value })[key]).toBe(value);
    });

    it.each([
        ['juvenileTicks', 0],
        ['juvenileTicks', 1.5],
        ['juvenileBurn', -0.1],
        ['juvenileBurn', 1.5],
        ['kinPullWeight', -1],
        ['kinPullWeight', 4.5],
        ['kinPullWeight', NaN],
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
