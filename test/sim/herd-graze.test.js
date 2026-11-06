import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { createWorld } from '../../js/sim/spawn.js';
import { grazeHerds } from '../../js/sim/herd-graze.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

/** @param {Record<string, unknown>} [overrides] */
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
            floraPatchMax: 4,
            herdCount: 1,
            herdSize: 1,
            ...overrides,
            seed: 11,
        }),
        testPolicy,
    );
    world.herdX[0] = 400;
    world.herdY[0] = 500;
    return world;
}

/** @param {import('../../js/sim/world.js').World} world @param {number} slot @param {number} kind @param {number} x @param {number} y @param {number} value */
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

    it('skips every animal in a stampede and decrements its alarm once per group tick', () => {
        const world = build({ herdSize: 2 });
        world.herdAlive[1] = 1;
        world.herdGroup[1] = 0;
        world.herdX[1] = 400;
        world.herdY[1] = 500;
        addFood(world, 0, FOOD_KIND.PLANT, 400, 500, 100);
        world.groupAlarm[0] = 2;
        grazeHerds(world);
        expect(world.groupAlarm[0]).toBe(1);
        expect(world.foodAlive[0]).toBe(1);
        grazeHerds(world);
        expect(world.groupAlarm[0]).toBe(0);
        expect(world.foodAlive[0]).toBe(1);
        grazeHerds(world);
        expect(world.foodAlive[0]).toBe(0);
    });

    it('eats the same plants as a full scan of every slot, animal by animal, across groups', () => {
        const world = build({ herdCount: 3, herdSize: 3, maxFood: 400, maxAgents: 4 });
        let seed = 12345;
        const rand = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let animal = 0; animal < 9; animal++) {
            world.herdAlive[animal] = animal === 4 ? 0 : 1;
            world.herdGroup[animal] = Math.floor(animal / 3);
            world.herdX[animal] = 300 + 600 * Math.floor(animal / 3) + 40 * (animal % 3);
            world.herdY[animal] = 400 + 30 * (animal % 3);
        }
        for (let slot = 0; slot < 400; slot++) {
            const kind = rand() < 0.2 ? FOOD_KIND.MEAT : FOOD_KIND.PLANT;
            addFood(world, slot, kind, 250 + rand() * 1500, 350 + rand() * 120, 10 + slot);
            world.foodRadius[slot] = 2 + rand() * 10;
        }
        const alive = Uint8Array.from(world.foodAlive);
        const { herdRadius } = world.config;
        const expected = [];
        for (let animal = 0; animal < 9; animal++) {
            if (world.herdAlive[animal] !== 1) {
                continue;
            }
            let best = -1;
            let bestDistance = Infinity;
            for (let food = 0; food < 400; food++) {
                const reach = herdRadius + world.foodRadius[food];
                const dx = world.foodX[food] - world.herdX[animal];
                const dy = world.foodY[food] - world.herdY[animal];
                const distance = dx * dx + dy * dy;
                if (alive[food] === 1 && world.foodKind[food] === FOOD_KIND.PLANT && distance <= reach * reach) {
                    if (distance < bestDistance) {
                        best = food;
                        bestDistance = distance;
                    }
                }
            }
            if (best >= 0) {
                alive[best] = 0;
                expected.push(best);
            }
        }
        expect(expected.length).toBeGreaterThan(3);
        grazeHerds(world);
        expect(Array.from(world.foodAlive.subarray(0, 400))).toEqual(Array.from(alive.subarray(0, 400)));
    });
});
