import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { createWorld } from '../../js/sim/spawn.js';
import { stepHerds } from '../../js/sim/herd-motion.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

function build(overrides = {}) {
    const world = createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 2000,
            worldHeight: 1200,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            maxFood: 8,
            initialFood: 0,
            foodPatchCount: 0,
            herdCount: 1,
            herdSize: 2,
            ...overrides,
        }),
        testPolicy,
    );
    world.herdX[0] = 400;
    world.herdY[0] = 600;
    world.herdX[1] = 420;
    world.herdY[1] = 600;
    world.groupPatch.fill(-1);
    return world;
}

/** @param {import('../../js/sim/world.js').World} world @param {{x: number, y: number, predator?: boolean}} opts */
function addHunter(world, { x, y, predator = true }) {
    world.alive[0] = 1;
    world.x[0] = x;
    world.y[0] = y;
    world.spec[0] = predator ? world.config.specialisations.predator.index : world.config.specialisations.forager.index;
}

describe('stepHerds startle response', () => {
    it('starts a seeded flee response for an in-range hunter and moves at run speed', () => {
        const world = build();
        addHunter(world, { x: 500, y: 600 });
        clearEvents(world.events);
        stepHerds(world);
        expect(world.groupAlarm[0]).toBe(world.config.herdStampedeTicks);
        expect(world.groupFleeX[0]).toBe(-1);
        expect(world.herdVx[0]).toBeLessThan(0);
        expect(Math.hypot(world.herdVx[0], world.herdVy[0])).toBeLessThanOrEqual(world.config.herdRunSpeed);
        expect(world.events.data[0]).toBe(EVENT_TYPE.HERD_STAMPEDE);
        expect(world.events.data[2]).toBe(0);
        expect(world.events.data[3]).toBe(0);
        expect(world.events.data[4]).toBe(2);
    });

    it('ignores non-hunters and hunters outside the individual-animal range', () => {
        const nonHunter = build();
        addHunter(nonHunter, { x: 500, y: 600, predator: false });
        clearEvents(nonHunter.events);
        stepHerds(nonHunter);
        expect(nonHunter.groupAlarm[0]).toBe(0);
        expect(nonHunter.events.count).toBe(0);

        const distant = build({ herdStartleRadius: 50 });
        addHunter(distant, { x: 500, y: 600 });
        clearEvents(distant.events);
        stepHerds(distant);
        expect(distant.groupAlarm[0]).toBe(0);
        expect(distant.events.count).toBe(0);
    });

    it('stagger-checks groups over eight ticks', () => {
        const world = build({ herdCount: 2 });
        addHunter(world, { x: 500, y: 600 });
        world.herdX[2] = 400;
        world.herdY[2] = 600;
        world.herdX[3] = 420;
        world.herdY[3] = 600;
        clearEvents(world.events);
        stepHerds(world);
        expect(world.groupAlarm[0]).toBeGreaterThan(0);
        expect(world.groupAlarm[1]).toBe(0);
        world.tick = 7;
        stepHerds(world);
        expect(world.groupAlarm[1]).toBeGreaterThan(0);
    });
});
