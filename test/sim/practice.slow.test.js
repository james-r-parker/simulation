// The reward-gated learning of realistic-keepers.md (T5): a real world runs with reward-gated learning for
// 5000 ticks from seed 1. The invariants hold every tick and two runs end on the same `worldHash`.

import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { golden } from './golden-run.js';

const TICKS = 5000;
const TIMEOUT_MS = scaleTimeout(180_000);
const BUSY = golden.cases.find((/** @type {{name: string}} */ c) => c.name === 'busy').overrides;

/**
 * @param {Record<string, any>} switches the switches to set
 * @returns {{hash: string, rewards: number}} the end hash and the rewards earned
 */
function run(switches) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...BUSY, ...switches, checkInvariants: false }), policy);
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        assertInvariants(world);
    }
    const rewards = world.rewardCounts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    return { hash: hashWorld(world), rewards };
}

describe('practice on a real world', () => {
    it(
        'keeps the invariants and ends on the same hash twice with reward-gated learning',
        () => {
            const a = run({});
            expect(a.rewards).toBeGreaterThan(0);
            expect(run({}).hash).toBe(a.hash);
        },
        TIMEOUT_MS,
    );
});
