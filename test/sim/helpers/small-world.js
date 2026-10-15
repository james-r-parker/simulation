import { createConfig } from '../../../js/sim/config.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { testPolicy } from './test-policy.js';

/**
 * Builds a small empty world for environment-style tests.
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof createWorld>}
 */
export function smallWorld(over = {}) {
    const config = createConfig({
        worldWidth: 1000,
        worldHeight: 1000,
        maxAgents: 8,
        initialAgents: 0,
        minAgents: 0,
        rayCount: 4,
        brainHidden: 3,
        maxFood: 4,
        initialFood: 0,
        obstacleCount: 2,
        obstacleMinRadius: 20,
        obstacleMaxRadius: 60,
        fertileZoneMax: 3,
        ...over,
    });
    return createWorld(config, testPolicy);
}
