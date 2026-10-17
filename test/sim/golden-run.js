import { readFileSync } from 'node:fs';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';

/** The committed golden file: `cases` (full runs) and `shortCases` (the fast-tier runs). */
export const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));

const INVARIANT_EVERY = 100;

/**
 * Runs one golden case from seed 1 with the reference policy, checking invariants every 100 ticks.
 * @param {{ overrides: object, ticks: number }} golden The case.
 * @returns {string} The world hash after the last tick.
 */
export function runGolden({ overrides, ticks }) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    for (let t = 1; t <= ticks; t++) {
        step(world, policy);
        if (t % INVARIANT_EVERY === 0) {
            assertInvariants(world);
        }
    }
    return hashWorld(world);
}
