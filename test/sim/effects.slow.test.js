// Leaving the neutral rules out of the fold is exact (docs/designs/status-effects.md, Phase 5): a world that folds every
// rule of every lane, the ones whose factor is exactly 1 included, hashes as the world that folds the active ones alone.

import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { SYSTEM } from '../../js/sim/effects.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 2000;

/**
 * @param {boolean} everyRule whether the world folds every rule, not only the active ones
 * @returns {string | number} the world's hash after `TICKS` ticks
 */
function hashAfter(everyRule) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ seed: 11, initialAgents: 60, maxAgents: 90 }), policy);
    if (everyRule) {
        world.laneRules = SYSTEM.rules.map((rules) => rules?.slice());
    }
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
    }
    return hashWorld(world);
}

describe('the neutral rules left out of the fold', () => {
    it(
        `change no bit of a world over ${TICKS} ticks`,
        () => {
            expect(hashAfter(false)).toBe(hashAfter(true));
        },
        scaleTimeout(120000),
    );
});
