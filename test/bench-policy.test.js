import { describe, expect, it } from 'vitest';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { createSubject } from '../scripts/bench.mjs';

/**
 * @param {string | undefined} name the policy name
 * @returns {{subject: ReturnType<typeof createSubject>, world: Record<string, any>}} a small fixed-population run
 */
function smallRun(name) {
    const config = createConfig({ initialAgents: 30, minAgents: 30, maxAgents: 30, seed: 4 });
    const subject = createSubject(config, name);
    const world = createWorld(config, subject.brain);
    subject.observe(world);
    return { subject, world };
}

describe('createSubject', () => {
    it('has no policy object for the reference bench and steps without an observer', () => {
        const { subject, world } = smallRun(undefined);
        subject.advance(world);
        expect(subject.policy).toBeUndefined();
        expect(world.tick).toBe(1);
    });
});
