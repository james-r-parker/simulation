import { describe, expect, it } from 'vitest';
import { LIVE_POLICY, POLICIES, getPolicy } from '../../../js/evo/policies/index.js';

describe('policies', () => {
    it('registers map-elites-v6 as the live policy', () => {
        expect(LIVE_POLICY).toBe('map-elites-v6');
        expect(Object.keys(POLICIES)).toEqual([
            'baseline-v5',
            'map-elites-v1',
            'map-elites-v1q',
            'map-elites-v6',
            'natural-v1',
        ]);
        expect(getPolicy('baseline-v5')).toBe(POLICIES['baseline-v5']);
    });

    it('creates a policy object with the documented shape', () => {
        const policy = getPolicy('baseline-v5').create({});
        expect(policy.name).toBe('baseline-v5');
        expect(policy.fitnessName).toBe('v5');
        expect(typeof policy.fitness).toBe('function');
        expect(typeof policy.brain.initBrain).toBe('function');
        expect(typeof policy.brain.childBrain).toBe('function');
        expect(policy.brain.initSpec).toBeUndefined();
        expect(policy.archive).toBeUndefined();
    });

    it('lists the known names when the name is unknown', () => {
        expect(() => getPolicy('nope')).toThrow(
            'Unknown policy "nope"; known: baseline-v5, map-elites-v1, map-elites-v1q, map-elites-v6, natural-v1',
        );
    });

    it('does not resolve inherited object keys', () => {
        expect(() => getPolicy('toString')).toThrow(/Unknown policy/);
    });
});

describe('map-elites-v1q', () => {
    it('is map-elites-v1 under its own name with the four-draw parent tournament', async () => {
        const { createConfig } = await import('../../../js/sim/config.js');
        const { QUALITY_CELL_DRAWS } = await import('../../../js/evo/policies/index.js');
        const config = createConfig({ maxAgents: 20, initialAgents: 10, minAgents: 5 });
        const policy = getPolicy('map-elites-v1q').create({ config, log: { log() {} } });
        expect(policy.name).toBe('map-elites-v1q');
        expect(policy.archive).toBeDefined();
        expect(QUALITY_CELL_DRAWS).toBe(4);
    });
});
