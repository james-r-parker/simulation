import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { stepHerds } from '../../js/sim/herd-motion.js';
import { createWorld } from '../../js/sim/spawn.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

const SMALL = {
    worldWidth: 2000,
    worldHeight: 1200,
    maxAgents: 4,
    initialAgents: 0,
    minAgents: 0,
    maxFood: 8,
    initialFood: 0,
    foodPatchCount: 2,
    floraPatchMax: 4,
    herdCount: 1,
    herdSize: 2,
};

function build() {
    return createWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL, seed: 71 }), testPolicy);
}

describe('stepHerds', () => {
    it('selects the best weighted patch, moves toward it, and records its route', () => {
        const world = build();
        clearEvents(world.events);
        world.herdX[0] = 300;
        world.herdY[0] = 600;
        world.herdX[1] = 320;
        world.herdY[1] = 600;
        world.herdAlive[1] = 0;
        world.herdStore[1] = 0;
        world.patchAlive[0] = 1;
        world.patchAlive[1] = 1;
        world.patchX[0] = 350;
        world.patchY[0] = 600;
        world.patchX[1] = 700;
        world.patchY[1] = 600;
        world.patchWeight[0] = 10;
        world.patchWeight[1] = 100;
        const before = hashWorld(world);
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(1);
        expect(world.herdX[0]).toBeGreaterThan(300);
        expect(world.herdX[0]).toBeCloseTo(300.075, 3);
        expect(world.events.data[0]).toBe(EVENT_TYPE.HERD_ROUTE_CHANGED);
        expect(world.events.data[2]).toBe(0);
        expect(world.events.data[3]).toBe(1);
        expect(hashWorld(world)).not.toBe(before);
    });

    it('does not allocate a route or draw when there are no live fruiting patches', () => {
        const world = build();
        world.patchAlive.fill(0);
        world.patchWeight.fill(0);
        clearEvents(world.events);
        const rngBefore = new Uint32Array(world.rng.herds.s);
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(-1);
        expect(world.events.count).toBe(0);
        expect(world.rng.herds.s).toEqual(rngBefore);
    });

    it('keeps idle when there are no herd slots', () => {
        const world = createWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL, herdCount: 0 }), testPolicy);
        clearEvents(world.events);
        expect(() => stepHerds(world)).not.toThrow();
        expect(world.events.count).toBe(0);
    });
});
