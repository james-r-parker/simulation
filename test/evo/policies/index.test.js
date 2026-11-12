import { describe, expect, it } from 'vitest';
import { createConfig } from '../../../js/sim/config.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';
import { LIVE_POLICY, POLICIES, getPolicy } from '../../../js/evo/policies/index.js';

describe('policies', () => {
    it('registers map-elites-v6 as the live policy', () => {
        expect(LIVE_POLICY).toBe('map-elites-v6');
        expect(Object.keys(POLICIES)).toEqual(['map-elites-v6']);
        expect(getPolicy('map-elites-v6')).toBe(POLICIES['map-elites-v6']);
    });

    it('creates a policy object with the documented shape', () => {
        const policy = getPolicy('map-elites-v6').create({ config: createConfig(SIMPLE_WORLD) });
        expect(policy.name).toBe('map-elites-v6');
        expect(policy.fitnessName).toBe('v6');
        expect(typeof policy.fitness).toBe('function');
        expect(typeof policy.brain.initBrain).toBe('function');
        expect(typeof policy.brain.childBrain).toBe('function');
        expect(policy.archive).toBeDefined();
    });

    it('lists the known names when the name is unknown', () => {
        expect(() => getPolicy('nope')).toThrow('Unknown policy "nope"; known: map-elites-v6');
    });

    it('does not resolve inherited object keys', () => {
        expect(() => getPolicy('toString')).toThrow(/Unknown policy/);
    });
});
