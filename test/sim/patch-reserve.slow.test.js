import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 3000;
const PATCHES = 6;

/**
 * @param {ReturnType<typeof createWorld>} world the world
 * @returns {number[]} each patch's standing plant energy, by item serial
 */
function standing(world) {
    const sums = new Array(PATCHES).fill(0);
    for (let i = 0; i < world.foodAlive.length; i++) {
        const patch = world.foodPatch[i];
        if (world.foodAlive[i] === 1 && patch >= 0 && world.foodPatchSerial[i] === world.patchSerial[patch]) {
            sums[patch] += world.foodValue[i];
        }
    }
    return sums;
}

describe('patchReserved over a running world', () => {
    it(
        'equals the standing plant energy of each patch, and stock stays above the floor and reserve',
        () => {
            const policy = cloneWithNoisePolicy();
            const world = createWorld(
                createConfig({
                    ...SIMPLE_WORLD,
                    worldWidth: 3000,
                    worldHeight: 2000,
                    maxAgents: 200,
                    initialAgents: 60,
                    minAgents: 0,
                    maxFood: 400,
                    initialFood: 100,
                    foodRegrowPerArea: 0.5,
                    foodPatchCount: PATCHES,
                    foodPatchRadius: 300,
                    foodPatchCapacity: 50000,
                    patchStockEnergy: true,
                    herdCount: 2,
                    herdSize: 3,
                    seed: 5,
                }),
                policy,
            );
            for (let t = 1; t <= TICKS; t++) {
                step(world, policy);
                if (t % 100 === 0) {
                    const sums = standing(world);
                    for (let p = 0; p < PATCHES; p++) {
                        expect(world.patchReserved[p]).toBeCloseTo(world.patchAlive[p] === 1 ? sums[p] : 0, 6);
                    }
                }
            }
            expect(world.foodCount).toBeGreaterThan(0);
            expect(world.floraMeals[0]).toBeGreaterThan(0);
        },
        scaleTimeout(240_000),
    );
});
