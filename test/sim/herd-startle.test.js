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
        expect(world.events.data[5]).toBe(world.groupCentroidX[0]);
        expect(world.events.data[6]).toBe(world.groupCentroidY[0]);
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

    it('chooses a deterministic fallback direction when the hunter is at the herd centroid', () => {
        const even = build();
        addHunter(even, { x: 410, y: 600 });
        stepHerds(even);
        expect(even.groupFleeX[0]).toBe(1);
        expect(even.groupFleeY[0]).toBe(0);

        const odd = build({ herdCount: 2 });
        odd.herdX[2] = 1400;
        odd.herdY[2] = 600;
        odd.herdX[3] = 1420;
        odd.herdY[3] = 600;
        addHunter(odd, { x: 1410, y: 600 });
        odd.tick = 7;
        stepHerds(odd);
        expect(odd.groupFleeX[1]).toBe(-1);
        expect(odd.groupFleeY[1]).toBe(0);
    });

    it('picks the same hunter as an all-pairs reference among many agents and herd animals', () => {
        const world = build({ herdSize: 8, maxAgents: 40 });
        const hunterSpec = world.config.specialisations.predator.index;
        const preySpec = world.config.specialisations.forager.index;
        for (let a = 0; a < 8; a++) {
            world.herdX[a] = 400 + ((a * 17) % 60);
            world.herdY[a] = 600 + ((a * 29) % 70);
            world.herdAlive[a] = a === 5 ? 0 : 1;
        }
        const range = world.config.herdStartleRadius;
        for (let h = 0; h < 40; h++) {
            world.alive[h] = h % 9 === 4 ? 0 : 1;
            world.spec[h] = h % 3 === 0 ? preySpec : hunterSpec;
            world.x[h] = 430 + Math.cos(h * 2.3) * range * (0.4 + (h % 7) * 0.2);
            world.y[h] = 630 + Math.sin(h * 2.3) * range * (0.4 + (h % 7) * 0.2);
        }
        stepHerds(world);
        let expected = -1;
        let best = Infinity;
        for (let h = 0; h < 40; h++) {
            const canHunt = world.alive[h] === 1 && world.spec[h] === hunterSpec;
            const near = [...Array(8).keys()].some(
                (a) =>
                    world.herdAlive[a] === 1 &&
                    (world.x[h] - world.herdX[a]) ** 2 + (world.y[h] - world.herdY[a]) ** 2 <= range * range,
            );
            const dx = world.x[h] - world.groupCentroidX[0];
            const dy = world.y[h] - world.groupCentroidY[0];
            if (canHunt && near && dx * dx + dy * dy < best) {
                best = dx * dx + dy * dy;
                expected = h;
            }
        }
        expect(expected).toBeGreaterThanOrEqual(0);
        expect(world.events.data[3]).toBe(expected);
    });
});
