import { describe, expect, it } from 'vitest';
import { runSignals } from '../scripts/signals-worker.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { SIMPLE_WORLD } from './helpers/simple-world.js';

// The worker pool runs runSignals in a worker thread, whose coverage a loaded run may not flush; this calls it directly.
const SMALL = { ...SIMPLE_WORLD, maxAgents: 40, initialAgents: 12, minAgents: 4, worldWidth: 1500, worldHeight: 1000 };

describe('runSignals (direct)', () => {
    it(
        'returns a census row per brain input and output, sampled on every agent tick',
        { timeout: scaleTimeout(30_000) },
        () => {
            const result = runSignals({ seed: 3, ticks: 200, policy: 'map-elites-v6', overrides: SMALL });
            expect(result.seed).toBe(3);
            expect(result.samples).toBeGreaterThan(0);
            expect(result.inputs).toHaveLength(106);
            expect(result.outputs).toHaveLength(11);
        },
    );
});
