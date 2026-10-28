import { describe, expect, it } from 'vitest';
import { occupiedCount } from '../js/evo/archive.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { createSubject } from '../scripts/bench.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

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

describe('createSubject with a real run', () => {
    it(
        'fills archive cells for map-elites-v1, whose deaths need the observer to be scored',
        () => {
            const { subject, world } = smallRun('map-elites-v1');
            const archive = subject.policy?.archive;
            expect(occupiedCount(archive)).toBe(0);
            for (let t = 0; t < 6000 && occupiedCount(archive) === 0; t++) {
                subject.advance(world);
            }
            expect(occupiedCount(archive)).toBeGreaterThan(0);
        },
        scaleTimeout(30000),
    );
});
