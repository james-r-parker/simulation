// grazeHerds against the plain per-group scan it replaced: every group walks all food slots and tests the exact
// box, then each animal eats the nearest overlapping plant. Same world, same draws, same final state.

import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { eatFromPatch } from '../../js/sim/food-patches.js';
import { loadHerdSeed } from '../../js/sim/herd-dung.js';
import { grazeHerds } from '../../js/sim/herd-graze.js';
import { createWorld } from '../../js/sim/spawn.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { FOOD_GONE, removeFood } from '../../js/sim/world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

const FOOD = 500;
const GROUPS = 8;
const SIZE = 5;

/** @param {number} seed @returns {() => number} a small deterministic generator for the layouts */
function generator(seed) {
    let state = seed;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** @param {() => number} rand @param {import('../../js/sim/world.js').World} world @returns {void} */
function placeHerds(rand, world) {
    for (let group = 0; group < GROUPS; group++) {
        const cx = rand() * 2100 - 50;
        const cy = rand() * 1300 - 50;
        world.groupAlarm[group] = rand() < 0.15 ? 1 + Math.floor(rand() * 3) : 0;
        for (let i = 0; i < SIZE; i++) {
            const animal = group * SIZE + i;
            world.herdAlive[animal] = rand() < 0.85 ? 1 : 0;
            world.herdGroup[animal] = group;
            world.herdX[animal] = cx + rand() * 260 - 130;
            world.herdY[animal] = cy + rand() * 260 - 130;
            world.herdGraze[animal] = rand() < 0.25 ? 1 + Math.floor(rand() * 2) : 0;
        }
    }
}

/** @param {() => number} rand @param {import('../../js/sim/world.js').World} world @returns {void} */
function placePlants(rand, world) {
    for (let slot = 0; slot < FOOD; slot++) {
        world.foodAlive[slot] = rand() < 0.9 ? 1 : 0;
        world.foodKind[slot] = rand() < 0.2 ? FOOD_KIND.MEAT : FOOD_KIND.PLANT;
        world.foodX[slot] = rand() * 2200 - 100;
        world.foodY[slot] = rand() * 1400 - 100;
        world.foodRadius[slot] = rand() < 0.1 ? 90 + rand() * 40 : 2 + rand() * 10;
        world.foodValue[slot] = 10 + slot;
        world.foodLife[slot] = 1000;
        world.foodCount += world.foodAlive[slot];
    }
}

/** @param {number} seed @returns {import('../../js/sim/world.js').World} a world with random herds, alarms, timers and plants */
function layout(seed) {
    const world = createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 2000,
            worldHeight: 1200,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            maxFood: FOOD,
            initialFood: 0,
            foodPatchCount: 0,
            floraPatchMax: 4,
            herdCount: GROUPS,
            herdSize: SIZE,
            seed: 11,
        }),
        testPolicy,
    );
    const rand = generator(seed);
    placeHerds(rand, world);
    placePlants(rand, world);
    return world;
}

/** @param {import('../../js/sim/world.js').World} world @param {number} group @returns {number[]} `[minX, minY, maxX, maxY]` of the ready animals */
function readyBoxNaive(world, group) {
    const { herdSize } = world.config;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let animal = group * herdSize; animal < (group + 1) * herdSize; animal++) {
        if (world.herdAlive[animal] === 1 && world.herdGraze[animal] <= 0) {
            box[0] = Math.min(box[0], world.herdX[animal]);
            box[1] = Math.min(box[1], world.herdY[animal]);
            box[2] = Math.max(box[2], world.herdX[animal]);
            box[3] = Math.max(box[3], world.herdY[animal]);
        }
    }
    return box;
}

/** @param {import('../../js/sim/world.js').World} world @param {number[]} box @returns {number[]} ascending plant slots near the box */
function plantsNearNaive(world, box) {
    const near = [];
    for (let food = 0; food < world.foodAlive.length; food++) {
        const slack = world.config.herdRadius + world.foodRadius[food];
        const x = world.foodX[food];
        const y = world.foodY[food];
        const plant = world.foodAlive[food] === 1 && world.foodKind[food] === FOOD_KIND.PLANT;
        if (plant && x >= box[0] - slack && x <= box[2] + slack && y >= box[1] - slack && y <= box[3] + slack) {
            near.push(food);
        }
    }
    return near;
}

/** @param {import('../../js/sim/world.js').World} world @param {number} animal @param {number[]} near @returns {number} */
function nearestNaive(world, animal, near) {
    let best = -1;
    let bestDistance = Infinity;
    for (const food of near) {
        if (world.foodAlive[food] !== 1) {
            continue;
        }
        const dx = world.foodX[food] - world.herdX[animal];
        const dy = world.foodY[food] - world.herdY[animal];
        const sum = world.config.herdRadius + world.foodRadius[food];
        const distance = dx * dx + dy * dy;
        if (distance <= sum * sum && distance < bestDistance) {
            best = food;
            bestDistance = distance;
        }
    }
    return best;
}

/** @param {import('../../js/sim/world.js').World} world @param {number} animal @param {number} food @returns {void} */
function eatNaive(world, animal, food) {
    const value = world.foodValue[food];
    loadHerdSeed(world, animal, food);
    eatFromPatch(world, food);
    removeFood(world, food, FOOD_GONE.EATEN, value);
    world.herdStore[animal] = Math.min(
        world.config.herdStoreMax,
        world.herdStore[animal] + world.config.herdAssimilation * value,
    );
    world.herdGraze[animal] = world.config.herdGrazeTicks;
    world.herdTotals[0] += value;
}

/** The old `grazeHerds`: one full food scan per calm group. @param {import('../../js/sim/world.js').World} world @returns {void} */
function grazeNaive(world) {
    const { herdSize, herdCount } = world.config;
    for (let group = 0; group < herdCount; group++) {
        if (world.groupAlarm[group] > 0) {
            world.groupAlarm[group]--;
            continue;
        }
        const near = plantsNearNaive(world, readyBoxNaive(world, group));
        for (let animal = group * herdSize; animal < (group + 1) * herdSize; animal++) {
            if (world.herdAlive[animal] !== 1) {
                continue;
            }
            if (world.herdGraze[animal] > 0) {
                world.herdGraze[animal]--;
                continue;
            }
            const food = nearestNaive(world, animal, near);
            if (food >= 0) {
                eatNaive(world, animal, food);
            }
        }
    }
}

describe('grazeHerds against the per-group full scan', () => {
    it('leaves the same world after every tick of 40 random herd and plant layouts', () => {
        let eaten = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const fast = layout(seed);
            const slow = layout(seed);
            for (let tick = 0; tick < 4; tick++) {
                grazeHerds(fast);
                grazeNaive(slow);
                expect(Array.from(fast.foodAlive)).toEqual(Array.from(slow.foodAlive));
                expect(Array.from(fast.herdStore)).toEqual(Array.from(slow.herdStore));
                expect(Array.from(fast.herdGraze)).toEqual(Array.from(slow.herdGraze));
                expect(Array.from(fast.groupAlarm)).toEqual(Array.from(slow.groupAlarm));
                expect(hashWorld(fast)).toBe(hashWorld(slow));
            }
            eaten += FOOD - fast.foodCount;
        }
        expect(eaten).toBeGreaterThan(100);
    });
});
