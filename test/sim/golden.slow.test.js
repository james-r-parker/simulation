import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';

const { cases } = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const INVARIANT_EVERY = 100;
const TIMEOUT_MS = 120_000;

// "default" is the shipped config; "busy" is a crowded world where random brains meet, so mating, splits, bites, the
// floor and immigrants all happen within the run and the hash guards them too.
for (const golden of cases) {
    describe(`golden run: ${golden.name}`, () => {
        it(
            'reaches the pinned world hash with invariants holding',
            () => {
                const policy = cloneWithNoisePolicy();
                const world = createWorld(createConfig({ ...golden.overrides, checkInvariants: false }), policy);
                for (let t = 1; t <= golden.ticks; t++) {
                    step(world, policy);
                    if (t % INVARIANT_EVERY === 0) {
                        assertInvariants(world);
                    }
                }
                expect(hashWorld(world)).toBe(golden.worldHash);
            },
            TIMEOUT_MS,
        );
    });
}
