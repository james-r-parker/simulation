import { describe, expect, it } from 'vitest';
import { occupiedCount } from '../js/evo/archive.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { createSubject } from '../scripts/bench.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/**
 * A small run whose proof rule is easy to meet (any meal proves an agent), so an established death happens early:
 * the archive takes only established genomes.
 * @param {string | undefined} name the policy name
 * @returns {{subject: ReturnType<typeof createSubject>, world: Record<string, any>}} a small run with room to breed
 */
function smallRun(name) {
    const config = createConfig({
        initialAgents: 30,
        minAgents: 10,
        maxAgents: 60,
        seed: 4,
        splitDeliberateMin: 0,
        splitDeliberateShareMin: 0,
    });
    const subject = createSubject(config, name);
    const world = createWorld(config, subject.brain);
    subject.observe(world);
    return { subject, world };
}

describe('createSubject with a real run', () => {
    it(
        'fills archive cells for map-elites-v6, whose deaths need the observer to be scored',
        () => {
            const { subject, world } = smallRun('map-elites-v6');
            const archive = subject.policy?.archive;
            expect(occupiedCount(archive)).toBe(0);
            for (let t = 0; t < 20000 && occupiedCount(archive) === 0; t++) {
                subject.advance(world);
            }
            expect(occupiedCount(archive)).toBeGreaterThan(0);
        },
        scaleTimeout(60000),
    );
});
