import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { FEATURES_OFF, FEATURES_ON } from '../../scripts/lib/features-on.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TIMEOUT_MS = scaleTimeout(60_000);
const TICKS = 3000;
const NEUTRAL = { meritMateWeight: 0, meritBirthBoost: 0, splitDeliberateMin: 0 };

/**
 * Runs a seed-1 world and records every birth, with its tick and event fields, plus the final positions.
 * @param {Record<string, any>} over config overrides
 * @returns {{births: string[], x: number[], energy: number[]}} the births in order and the final state
 */
function run(over) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ seed: 1, ...over }), policy);
    /** @type {string[]} */
    const births = [];
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        for (let i = 0; i < world.events.count; i++) {
            const o = i * EVENT_STRIDE;
            if (world.events.data[o] === EVENT_TYPE.AGENT_BORN) {
                births.push(`${t}:${Array.from(world.events.data.subarray(o, o + EVENT_STRIDE)).join(',')}`);
            }
        }
    }
    return { births, x: Array.from(world.x), energy: Array.from(world.energy) };
}

describe('merit switched on with every weight at 0 reproduces the world with merit off', () => {
    it.each([
        ['FEATURES_OFF', FEATURES_OFF],
        ['FEATURES_ON', FEATURES_ON],
    ])(
        'tick for tick on %s, seed 1, 3000 ticks: the same births, positions and energies',
        (_name, features) => {
            const off = run({ ...features, meritEnabled: false });
            const on = run({ ...features, ...NEUTRAL, meritEnabled: true });
            expect(off.births.length).toBeGreaterThan(20);
            expect(on.births.length).toBe(off.births.length);
            expect(on.births).toEqual(off.births);
            expect(on.x).toEqual(off.x);
            expect(on.energy).toEqual(off.energy);
        },
        TIMEOUT_MS,
    );
});
