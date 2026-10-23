import { describe, expect, it } from 'vitest';
import { FEATURES_OFF } from '../scripts/lib/features-on.mjs';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { hashWorld } from '../js/sim/world-hash.js';

const RESCUE_KEYS = ['predatorRescueMin', 'predatorRescueInterval'];

describe('feature switch lists, real worlds', () => {
    it('reproduce the world without the rescue keys tick for tick when they are off', () => {
        const withoutRescue = Object.fromEntries(
            Object.entries(FEATURES_OFF).filter(([key]) => !RESCUE_KEYS.includes(key)),
        );
        const size = { initialAgents: 20, minAgents: 20, maxAgents: 30 };
        const pinned = createConfig({ ...FEATURES_OFF, ...size });
        const unpinned = createConfig({ ...withoutRescue, ...size });
        const brainA = cloneWithNoisePolicy();
        const brainB = cloneWithNoisePolicy();
        const a = createWorld(pinned, brainA);
        const b = createWorld(unpinned, brainB);
        for (let tick = 0; tick < 200; tick++) {
            step(a, brainA);
            step(b, brainB);
            expect(hashWorld(a), `tick ${tick}`).toBe(hashWorld(b));
        }
    }, 180000);
});
