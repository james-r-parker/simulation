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

    it('uses run speed and caps a fleeing animal at the run limit', () => {
        const world = build();
        world.groupAlarm[0] = 10;
        world.groupFleeX[0] = 1;
        world.groupFleeY[0] = 0;
        world.herdVx[0] = world.config.herdRunSpeed * 10;
        world.herdVy[0] = 0;
        steerGroup(world, 0, 500, 600);
        expect(Math.hypot(world.herdVx[0], world.herdVy[0])).toBeLessThanOrEqual(world.config.herdRunSpeed + 1e-5);
        expect(world.herdVx[0]).toBeGreaterThan(world.config.herdWalkSpeed);
    });

    it('pushes away from a closed wall and resolves a body starting inside a rock', () => {
        const world = build();
        world.herdAlive[1] = 0;
        world.wallGapY = new Float64Array(0);
        world.herdX[0] = world.config.worldWidth / 2 - world.config.herdRadius - 10;
        world.herdY[0] = 300;
        steerGroup(world, 0, world.herdX[0], world.herdY[0]);
        expect(world.herdX[0]).toBeLessThan(world.config.worldWidth / 2);

        world.herdX[0] = world.config.worldWidth / 2 + world.config.herdRadius + 10;
        world.groupCentroidX[0] = world.herdX[0];
        world.wallGapY = new Float64Array(0);
        steerGroup(world, 0, world.herdX[0], world.herdY[0]);
        expect(world.herdX[0]).toBeGreaterThan(world.config.worldWidth / 2);

        world.herdX[0] = world.config.worldWidth / 2 - world.config.herdRadius - 10;
        world.herdY[0] = 300;
        world.wallGapY = Float64Array.of(300);
        steerGroup(world, 0, world.herdX[0], world.herdY[0]);
        expect(world.herdX[0]).toBeLessThan(world.config.worldWidth / 2);

        world.herdX[0] = 500;
        world.herdY[0] = 300;
        world.groupCentroidX[0] = 500;
        world.groupCentroidY[0] = 300;
        world.obsX[0] = 500;
        world.obsY[0] = 300;
        world.obsRadius[0] = 100;
        steerGroup(world, 0, 500, 300);
        expect(Math.hypot(world.herdX[0] - 500, world.herdY[0] - 300)).toBeGreaterThanOrEqual(
            world.config.herdRadius + world.obsRadius[0],
        );

        world.herdX[0] = 1500;
        world.herdY[0] = 300;
        world.groupCentroidX[0] = 1500;
        world.groupCentroidY[0] = 300;
        world.obsX[0] = 1500;
        world.obsY[0] = 300;
        steerGroup(world, 0, 1500, 300);
        expect(world.herdX[0]).toBeGreaterThan(1500);
    });
});
