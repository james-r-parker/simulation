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
    juvenileDependency: false,
    juvenileBurn: 0.6,
    kinPullWeight: 0.5,
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

    it.each(['satedBite', 'juvenileDependency'])('%s is a boolean that accepts true', (key) => {
        expect(make({ [key]: true })[key]).toBe(true);
        expect(() => make({ [key]: 1 })).toThrow(new RegExp(key));
    });

    it.each([
        ['predatorRestTicks', 65535],
        ['juvenileBurn', 0],
        ['juvenileBurn', 1],
        ['kinPullWeight', 0],
        ['kinPullWeight', 4],
        ['juvenileTicks', 1],
        ['territoryRadius', 0.5],
        ['territoryMax', 0],
        ['territoryMax', 5],
    ])('accepts %s at %s', (key, value) => {
        expect(make({ [key]: value })[key]).toBe(value);
    });

    it.each([
        ['juvenileBurn', -0.1],
        ['juvenileBurn', 1.5],
        ['kinPullWeight', -1],
        ['kinPullWeight', 4.5],
        ['kinPullWeight', NaN],
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

const REWARD_DEFAULTS = {
    rewardedHebb: false,
    rewardGain: 4,
    rewardBase: 0.25,
    rewardDecay: 0.02,
};

describe('the reward-gated learning keys (realistic-keepers T5)', () => {
    it.each(Object.entries(REWARD_DEFAULTS))('%s defaults to %s', (key, value) => {
        expect(DEFAULTS[key]).toBe(value);
        expect(make({})[key]).toBe(value);
    });

    it.each([
        ['rewardedHebb', true],
        ['rewardGain', 10],
        ['rewardBase', 0],
        ['rewardDecay', 1],
    ])('accepts %s at %s', (key, value) => {
        expect(make({ [key]: value })[key]).toBe(value);
    });

    it.each([
        ['rewardedHebb', 1],
        ['rewardGain', 11],
        ['rewardBase', 1.5],
        ['rewardDecay', -0.1],
    ])('rejects %s at %s, naming the key', (key, value) => {
        expect(() => make({ [key]: value })).toThrow(new RegExp(key));
    });
});
