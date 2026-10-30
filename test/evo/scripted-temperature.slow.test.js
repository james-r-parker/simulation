import { describe, expect, it } from 'vitest';
import { SCRIPTED_CONTROLLERS } from '../../js/evo/scripted.js';
import { createBaselineV5 } from '../../js/evo/policies/baseline-v5.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 10000;
const COLD_START = 20;
const COLD_TICKS = 3000;

/**
 * Runs one constant-thrust controller on the default world with no floor and no immigrants.
 * @param {keyof typeof SCRIPTED_CONTROLLERS} name a `SCRIPTED_CONTROLLERS` key
 * @returns {number} the population at the end
 */
function populationAfter(name) {
    const config = createConfig({ ...SIMPLE_WORLD, seed: 1, minAgents: 0 });
    const brain = createBaselineV5().brain;
    const world = createWorld(config, brain);
    const run = SCRIPTED_CONTROLLERS[name]({ world, rng: fork(createRng(1), 'scripted') });
    for (let t = 0; t < TICKS && world.population > 0; t++) {
        step(world, brain, { brain: run });
    }
    return world.population;
}

// Each run takes about 10 s alone and several times that under the gate's coverage instrumentation, so each case has
// its own generous timeout.
const TIMEOUT_MS = scaleTimeout(300_000);

describe('body temperature sweet spot', () => {
    it(
        'a sitter freezes',
        () => {
            expect(populationAfter('thrust0')).toBe(0);
        },
        TIMEOUT_MS,
    );

    it(
        'a rusher overheats out',
        () => {
            expect(populationAfter('thrust100')).toBe(0);
        },
        TIMEOUT_MS,
    );

    it(
        'a forager at a gentle speed grows',
        () => {
            expect(populationAfter('thrust20')).toBeGreaterThan(config100());
        },
        TIMEOUT_MS,
    );
});

describe('body temperature cold band', () => {
    it(
        'a foodSeeker started below the cold stress threshold moves, eats and rises above it',
        () => {
            // This pins body temperature, not predation, so the predator keeps the neutral multipliers: the tuned ones
            // slow the scripted foodSeeker's warm-up past COLD_TICKS.
            const config = createConfig({
                ...SIMPLE_WORLD,
                seed: 1,
                initialAgents: 30,
                minAgents: 0,
                specialisations: { predator: { biteMultiplier: 1, turnMultiplier: 1, sprintBoost: 1 } },
            });
            const brain = createBaselineV5().brain;
            const world = createWorld(config, brain);
            const run = SCRIPTED_CONTROLLERS.foodSeeker({ world, rng: fork(createRng(1), 'scripted') });
            /** @type {Map<number, number>} slot to the genome that started cold there */
            const starters = new Map();
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot]) {
                    world.temperature[slot] = COLD_START;
                    starters.set(slot, world.genomeId[slot]);
                }
            }
            const ate = new Set();
            let recovered = false;
            for (let t = 0; t < COLD_TICKS && !recovered; t++) {
                step(world, brain, { brain: run });
                for (let slot = 0; slot < world.alive.length; slot++) {
                    if (!world.alive[slot] || starters.get(slot) !== world.genomeId[slot]) {
                        continue;
                    }
                    if (world.foodEnergy[slot] > 0) {
                        ate.add(slot);
                    }
                    if (ate.has(slot) && world.temperature[slot] > config.temperatureColdStress) {
                        recovered = true;
                    }
                }
            }
            expect(ate.size).toBeGreaterThan(0);
            expect(recovered).toBe(true);
        },
        TIMEOUT_MS,
    );
});

/** @returns {number} the starting population, which the gentle forager must exceed */
function config100() {
    return createConfig({ ...SIMPLE_WORLD }).initialAgents;
}
