import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { PATCH_FLOOR_SHARE } from '../../js/sim/food-patches.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 8000;
const SETTLED = 3000;
const SAMPLE_EVERY = 250;
const MAX_AGENTS = 300;
const TIMEOUT_MS = scaleTimeout(240_000);

/**
 * Runs a small patchy world on area food and samples the population once it has settled.
 * @param {number} foodRegrowPerArea items per tick per 1,000,000 px2
 * @returns {{ samples: number[], mean: number, patchStock: number[] }} the settled populations and the end stocks
 */
function run(foodRegrowPerArea) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 3000,
            worldHeight: 2000,
            maxAgents: MAX_AGENTS,
            initialAgents: 60,
            minAgents: 0,
            maxFood: 400,
            initialFood: 100,
            foodRegrowPerArea,
            foodPatchCount: 6,
            foodPatchRadius: 300,
            foodPatchDepletion: 0.05,
            seed: 3,
        }),
        policy,
    );
    const samples = [];
    for (let t = 1; t <= TICKS; t++) {
        step(world, policy);
        if (t >= SETTLED && t % SAMPLE_EVERY === 0) {
            samples.push(world.population);
        }
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { samples, mean, patchStock: Array.from(world.patchStock) };
}

describe('area food over a run', () => {
    it(
        'lets a population eat its patches down and level off below maxAgents',
        () => {
            const { samples, patchStock } = run(0.08);
            for (const stock of patchStock) {
                expect(stock).toBeLessThan(PATCH_FLOOR_SHARE * 4);
            }
            expect(Math.min(...samples)).toBeGreaterThan(0);
            expect(Math.max(...samples)).toBeLessThan(MAX_AGENTS * 0.7);
        },
        TIMEOUT_MS,
    );

    it(
        'carries more agents when the area regrows more food',
        () => {
            const poor = run(0.08);
            const rich = run(0.5);
            expect(rich.mean).toBeGreaterThan(poor.mean * 1.3);
        },
        TIMEOUT_MS,
    );
});
