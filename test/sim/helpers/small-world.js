import { createConfig } from '../../../js/sim/config.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { testPolicy } from './test-policy.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';

/**
 * Builds a small empty world for environment-style tests.
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof createWorld>}
 */
export function smallWorld(over = {}) {
    const config = createConfig({
        ...SIMPLE_WORLD,
        worldWidth: 1000,
        worldHeight: 1000,
        maxAgents: 8,
        initialAgents: 0,
        minAgents: 0,
        rayCount: 4,
        brainHidden: 3,
        maxFood: 4,
        initialFood: 0,
        fertileZoneMax: 3,
        herdDungZoneMax: 3,
        ...over,
    });
    const world = createWorld(config, testPolicy);
    world.leakRate.fill(1); // hand-built agents take each new hidden value whole, the plain tanh rule
    return world;
}
