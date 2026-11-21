// `levelOfEffect` (the generated switch) against each effect's own reader, on the bodies of a running world.

import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { levelOfEffect } from '../../js/sim/effect-dispatch.js';
import { EFFECTS } from '../../js/sim/effect-list.js';
import { LEVEL, SHARE } from '../../js/sim/effect-refs.js';
import { SYSTEM } from '../../js/sim/effects.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} e the effect's index
 * @returns {number} the level read the long way: the stored row, or the effect's reader
 */
function naiveLevel(world, slot, e) {
    const effect = EFFECTS[e];
    if (effect.level === 'stacks') {
        return world.effectStacks[SYSTEM.rowOf[e]][slot];
    }
    const read = /** @type {Function} */ (effect.read);
    if (effect.level === 'share') {
        read(world, slot);
        return SHARE[0];
    }
    return read(world, slot);
}

describe('levelOfEffect', () => {
    it("leaves in LEVEL each effect's level as its reader computes it, for every body of a running world", () => {
        const policy = cloneWithNoisePolicy();
        const world = createWorld(
            createConfig({ seed: 5, initialAgents: 40, maxAgents: 60, woundThrust: 0.1 }),
            policy,
        );
        let compared = 0;
        for (let t = 0; t < 60; t++) {
            step(world, policy);
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot] !== 1) {
                    continue;
                }
                world.effectStacks[1][slot] = (slot + t) % 3; // a stored row with stacks on
                for (let e = 0; e < EFFECTS.length; e++) {
                    levelOfEffect(world, slot, e);
                    expect(LEVEL[0], `${EFFECTS[e].name} of slot ${slot}`).toBe(naiveLevel(world, slot, e));
                    compared += 1;
                }
                world.effectStacks[1][slot] = 0;
            }
        }
        expect(compared).toBeGreaterThan(1000);
    });

    it('refuses an index past the list', () => {
        expect(() => levelOfEffect({}, 0, EFFECTS.length)).toThrow(/no effect/);
    });
});
