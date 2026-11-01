import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createWorld } from '../../js/sim/spawn.js';
import { steerGroup } from '../../js/sim/herd-steering.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

function build() {
    return createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 2000,
            worldHeight: 1200,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            maxFood: 4,
            initialFood: 0,
            herdCount: 1,
            herdSize: 2,
        }),
        testPolicy,
    );
}

describe('steerGroup', () => {
    it('accelerates a lone animal toward its waypoint with the configured turn rate', () => {
        const world = build();
        world.herdX[0] = 300;
        world.herdY[0] = 600;
        world.herdAlive[1] = 0;
        world.herdStore[1] = 0;
        world.groupCentroidX[0] = 300;
        world.groupCentroidY[0] = 600;
        world.groupFleeX[0] = 0;
        world.groupFleeY[0] = 0;
        steerGroup(world, 0, 500, 600);
        expect(world.herdVx[0]).toBeCloseTo(world.config.herdWalkSpeed * 0.05, 5);
        expect(world.herdVy[0]).toBe(0);
        expect(world.herdX[0]).toBeGreaterThan(300);
    });
});
