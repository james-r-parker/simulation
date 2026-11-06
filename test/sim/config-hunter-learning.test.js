// The Phase 1 tuning keys of hunter-learning.md (T3): defaults and ranges, and the rules hash.

import { describe, expect, it } from 'vitest';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const DEFAULT_KEYS = {
    juvenileTicks: 3000,
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

    it.each([
        ['juvenileTicks', 1],
        ['territoryRadius', 0.5],
        ['territoryMax', 0],
        ['territoryMax', 5],
    ])('accepts %s at %s', (key, value) => {
        expect(make({ [key]: value })[key]).toBe(value);
    });

    it.each([
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

const PHASE2_DEFAULTS = {
    rewardedHebb: false,
    rewardSource: 'meat',
    rewardShuffle: false,
    rewardShuffleMin: 300,
    rewardShuffleMax: 3000,
    rewardGain: 4,
    rewardBase: 0.25,
    rewardDecay: 0.02,
};

describe('the hunter-learning Phase 2 keys', () => {
    it.each(Object.entries(PHASE2_DEFAULTS))('%s defaults to %s', (key, value) => {
        expect(DEFAULTS[key]).toBe(value);
        expect(make({})[key]).toBe(value);
    });

    it.each([
        ['rewardedHebb', true],
        ['rewardSource', 'kill'],
        ['rewardSource', 'kill-bite'],
        ['rewardShuffle', true],
        ['rewardGain', 10],
        ['rewardBase', 0],
        ['rewardDecay', 1],
    ])('accepts %s at %s', (key, value) => {
        expect(make({ [key]: value })[key]).toBe(value);
    });

    it.each([
        ['rewardedHebb', 1],
        ['rewardSource', 'any'],
        ['rewardShuffleMin', -1],
        ['rewardShuffleMax', 1.5],
        ['rewardGain', 11],
        ['rewardBase', 1.5],
        ['rewardDecay', -0.1],
    ])('rejects %s at %s, naming the key', (key, value) => {
        expect(() => make({ [key]: value })).toThrow(new RegExp(key));
    });
});
