import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { refreshFruiting } from '../../js/sim/fruiting.js';
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

    it('captures the patch value on arrival and leaves when it falls below its share', () => {
        const world = build();
        world.herdAlive[1] = 0;
        world.herdStore[1] = 0;
        world.patchAlive.fill(1);
        world.patchWeight[0] = 50;
        world.patchWeight[1] = 80;
        world.patchX[0] = world.herdX[0];
        world.patchY[0] = world.herdY[0];
        world.patchX[1] = 600;
        world.patchY[1] = 600;
        world.groupPatch[0] = 0;
        world.groupPatchWeight[0] = 100;
        stepHerds(world);
        expect(world.groupPatchWeight[0]).toBe(50);
        expect(world.groupStay[0]).toBeGreaterThan(0);
        world.groupStay[0] = 0;
        world.patchWeight[0] = world.groupPatchWeight[0] * world.config.herdLeaveShare - 1;
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(1);
    });

    it('changes its route as seasonal fruiting moves between patches', () => {
        const world = build();
        world.herdAlive[1] = 0;
        world.herdStore[1] = 0;
        world.patchAlive.fill(1);
        world.patchStock.fill(100);
        world.patchYield.fill(1);
        world.patchStart[0] = 0;
        world.patchStart[1] = 0.5;
        world.patchSpan.fill(0.25);
        world.patchX[0] = world.herdX[0];
        world.patchY[0] = world.herdY[0];
        world.patchX[1] = world.herdX[0] + 300;
        world.patchY[1] = world.herdY[0];

        world.season[1] = 0.125;
        refreshFruiting(world);
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(0);

        world.groupStay[0] = 0;
        world.season[1] = 0.625;
        refreshFruiting(world);
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(1);
    });

    it('keeps idle when there are no herd slots', () => {
        const world = createWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL, herdCount: 0 }), testPolicy);
        clearEvents(world.events);
        expect(() => stepHerds(world)).not.toThrow();
        expect(world.events.count).toBe(0);
    });

    it('does not choose a richer patch through a closed basin wall', () => {
        const world = build();
        world.wallGapY = new Float64Array(0);
        world.herdX[0] = 300;
        world.herdY[0] = 600;
        world.herdAlive[1] = 0;
        world.patchAlive.fill(1);
        world.patchX[0] = 300;
        world.patchX[1] = 1700;
        world.patchWeight[0] = 10;
        world.patchWeight[1] = 100;
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(0);
    });

    it('skips empty groups without routing or sensing', () => {
        const world = build();
        world.herdAlive.fill(0);
        clearEvents(world.events);
        stepHerds(world);
        expect(world.groupAnimalCount[0]).toBe(0);
        expect(world.events.count).toBe(0);
    });

    it('chooses a new patch when the stay timer expires', () => {
        const world = build();
        world.herdAlive[1] = 0;
        world.patchAlive.fill(1);
        world.patchWeight[0] = 50;
        world.patchWeight[1] = 100;
        world.patchX[0] = world.herdX[0];
        world.patchY[0] = world.herdY[0];
        world.patchX[1] = 600;
        world.patchY[1] = 600;
        world.groupPatch[0] = 0;
        world.groupPatchWeight[0] = 100;
        world.groupStay[0] = 1;
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(1);
    });

    it('stays without a route when the stay timer expires and no patch is available', () => {
        const world = build();
        world.herdAlive[1] = 0;
        world.patchAlive.fill(0);
        world.groupPatch[0] = 0;
        world.groupStay[0] = 1;
        world.groupPatchWeight[0] = 0;
        stepHerds(world);
        expect(world.groupPatch[0]).toBe(-1);
        expect(world.groupStay[0]).toBe(0);
    });
});
