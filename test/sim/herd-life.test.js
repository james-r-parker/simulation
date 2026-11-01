import { describe, expect, it } from 'vitest';
import { FOOD_KIND, FOOD_ORIGIN } from '../../js/sim/carcass.js';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { createWorld } from '../../js/sim/spawn.js';
import { ageAndReproduceHerds } from '../../js/sim/herd-life.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

/** @param {Record<string, unknown>} [overrides] @returns {import('../../js/sim/world.js').World} */
function build(overrides = {}) {
    return createWorld(
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
            floraPatchMax: 4,
            herdCount: 1,
            herdSize: 2,
            seed: 49,
            ...overrides,
        }),
        testPolicy,
    );
}

describe('ageAndReproduceHerds', () => {
    it('ages animals, leaves a limited carcass and marks the death site', () => {
        const world = build();
        world.herdX[0] = 500;
        world.herdY[0] = 500;
        world.herdAge[0] = 9;
        world.herdLife[0] = 10;
        world.herdStore[0] = 1200;
        world.herdAge[1] = 0;
        world.herdLife[1] = 100;
        world.foodAlive.fill(0);
        world.foodCount = 0;
        world.events.count = 0;
        ageAndReproduceHerds(world);
        expect(world.herdAlive[0]).toBe(0);
        expect(world.herdStore[0]).toBe(0);
        expect(world.foodCount).toBe(1);
        expect(world.foodKind[0]).toBe(FOOD_KIND.MEAT);
        expect(world.foodOrigin[0]).toBe(FOOD_ORIGIN.HERD_CARCASS);
        expect(world.foodValue[0]).toBeCloseTo(world.config.carcassShare * 1200);
        expect(world.foodLife[0]).toBe(world.config.herdCarcassTicks);
        expect(world.groupAnimalCount[0]).toBe(1);
        expect(Array.from(world.zoneAlive).some((alive) => alive === 1)).toBe(true);
        expect(Array.from(world.myceliumTicks).some((ticks) => ticks > 0)).toBe(true);
        expect(world.events.data[0]).toBe(EVENT_TYPE.HERD_ANIMAL_DIED);
    });

    it('records a lost carcass when every food slot is occupied', () => {
        const world = build({ maxFood: 1 });
        world.foodAlive.fill(0);
        world.foodCount = 0;
        world.foodAlive[0] = 1;
        world.foodCount = 1;
        world.herdX[0] = 500;
        world.herdY[0] = 500;
        world.herdAge[0] = world.herdLife[0] - 1;
        world.herdStore[0] = 1000;
        world.herdAge[1] = 0;
        world.herdLife[1] = 100;
        world.events.count = 0;
        ageAndReproduceHerds(world);
        expect(world.events.count).toBe(2);
        expect(world.events.data[EVENT_STRIDE]).toBe(EVENT_TYPE.HERD_CARCASS_LOST);
        expect(world.foodCount).toBe(1);
    });

    it('births a calf only when an eligible mother has paid and a clear slot exists', () => {
        const world = build({ herdBirthTicks: 10, herdBirthEnergy: 200, herdCalfEnergy: 80 });
        world.herdX[0] = 500;
        world.herdY[0] = 500;
        world.herdAge[0] = 10;
        world.herdLife[0] = 100;
        world.herdStore[0] = 300;
        world.herdAlive[1] = 0;
        world.herdStore[1] = 0;
        world.groupAnimalCount[0] = 1;
        world.groupBirthTimer[0] = 0;
        world.events.count = 0;
        ageAndReproduceHerds(world);
        expect(world.herdAlive[1]).toBe(1);
        expect(world.herdStore[0]).toBe(100);
        expect(world.herdStore[1]).toBe(80);
        expect(world.herdAge[1]).toBe(0);
        expect(world.groupAnimalCount[0]).toBe(2);
        expect(world.groupBirthTimer[0]).toBe(10);
        expect(world.events.data[0]).toBe(EVENT_TYPE.HERD_ANIMAL_BORN);
    });
});
