import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { createWorld } from '../../js/sim/spawn.js';
import { grazeHerds } from '../../js/sim/herd-graze.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

function build() {
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
            floraPatchMax: 4,
            herdCount: 1,
            herdSize: 1,
            seed: 11,
        }),
        testPolicy,
    );
    world.herdX[0] = 400;
    world.herdY[0] = 500;
    return world;
}

function addFood(world, slot, kind, x, y, value) {
    world.foodAlive[slot] = 1;
    world.foodKind[slot] = kind;
    world.foodX[slot] = x;
    world.foodY[slot] = y;
    world.foodRadius[slot] = 8;
    world.foodValue[slot] = value;
    world.foodLife[slot] = 1000;
    world.foodCount++;
}

describe('grazeHerds', () => {
    it('eats the nearest plant by slot tie-break, depletes its patch and assimilates its share', () => {
        const world = build();
        world.patchAlive[0] = 1;
        world.patchX[0] = 400;
        world.patchY[0] = 500;
        world.patchStock[0] = world.config.foodPatchCapacity;
        addFood(world, 0, FOOD_KIND.PLANT, 401, 500, 100);
        addFood(world, 1, FOOD_KIND.PLANT, 399, 500, 200);
        addFood(world, 2, FOOD_KIND.MEAT, 400, 500, 300);
        const before = world.herdStore[0];
        grazeHerds(world);
        expect(world.foodAlive[0]).toBe(0);
        expect(world.foodAlive[1]).toBe(1);
        expect(world.foodAlive[2]).toBe(1);
        expect(world.foodCount).toBe(2);
        expect(world.herdStore[0]).toBeCloseTo(before + 30, 10);
        expect(world.herdGraze[0]).toBe(world.config.herdGrazeTicks);
        expect(world.herdTotals[0]).toBe(100);
        expect(world.patchStock[0]).toBe(world.config.foodPatchCapacity - world.config.foodPatchDepletion);
    });

    it('decrements the graze timer and ignores meat items', () => {
        const world = build();
        addFood(world, 0, FOOD_KIND.MEAT, 400, 500, 300);
        world.herdGraze[0] = 2;
        grazeHerds(world);
        expect(world.herdGraze[0]).toBe(1);
        grazeHerds(world);
        expect(world.herdGraze[0]).toBe(0);
        grazeHerds(world);
        expect(world.foodAlive[0]).toBe(1);
        expect(world.herdTotals[0]).toBe(0);
    });
});
